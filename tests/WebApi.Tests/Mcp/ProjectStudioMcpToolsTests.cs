using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Files;
using Application.Projects;
using Domain.Models;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Unit tests for the project-studio MCP tools - notes, reference-board images, levels and
/// characters. The tools are thin pass-throughs over the command handlers the UI uses, so
/// these verify the tool's own logic: the audit claim, the partial-update merge, and the
/// image-source branches of <c>add_project_reference</c>.
/// </summary>
public class ProjectStudioMcpToolsTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static string Json(object value) => JsonSerializer.Serialize(value);

    /// <summary>An unauthenticated local caller - every scope, no identity (no MCP_TOKENS configured).</summary>
    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    /// <summary>An audit whose claim always succeeds (the key was free).</summary>
    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, "gen-1"));
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.AbandonAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    private static ProductionNoteDto Note(
        int id = 7,
        int projectId = 1,
        int? levelId = null,
        int? referenceImageId = null,
        int? characterId = null,
        string title = "Idea",
        string body = "A stealth level in a flooded temple.",
        bool isPinned = true) =>
        new(id, projectId, levelId, referenceImageId, characterId, title, body, isPinned, Now, Now);

    private static ProjectReferenceDto Reference(
        int id, int fileId, string title = "Hero", int projectId = 1) =>
        new(id, projectId, title, fileId, "hero.png", $"/files/{fileId}/preview?channel=rgb",
            $"/files/{fileId}", 0,
            Array.Empty<ProjectReferenceLinkDto>(), Array.Empty<string>(), Array.Empty<string>());

    private static ProjectLevelDto Level(
        int id = 3,
        int projectId = 1,
        string name = "Flooded Temple",
        string? description = "The opening level.",
        string status = "Planned",
        int sortOrder = 0) =>
        new(id, projectId, name, description, status, sortOrder,
            Array.Empty<string>(), 0, Now, Now);

    private static ProjectCharacterDto Character(
        int id = 5,
        int projectId = 1,
        string name = "Mara",
        string? description = "The diver.",
        IReadOnlyList<string>? tags = null) =>
        new(id, projectId, name, description, tags ?? new[] { "protagonist" },
            Array.Empty<ProjectCharacterImageDto>(), Array.Empty<ProjectCharacterModelDto>(),
            Array.Empty<CharacterAbilityDto>(), Array.Empty<CharacterVariantDto>(),
            0, 0, 0, 0, Now, Now);

    [Fact]
    public async Task AddProjectNote_Claims_The_Key_Then_Creates()
    {
        var handler = new Mock<ICommandHandler<CreateProductionNoteCommand, ProductionNoteDto>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateProductionNoteCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Note()));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddProjectNote(
            handler.Object, audit.Object, Caller(), projectId: 1, title: "Idea", body: "Flooded temple",
            idempotencyKey: "key-1", pinned: true, levelId: 2);

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<CreateProductionNoteCommand>(c =>
                c.ProjectId == 1 && c.Title == "Idea" && c.Body == "Flooded temple" && c.IsPinned && c.LevelId == 2),
            It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-1", "gen-1", "ProductionNote", 7, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateProjectNote_Keeps_Omitted_Fields_And_Records_What_It_Replaced()
    {
        // UpdateProductionNote replaces the whole note, so an omitted title/pinned must come
        // back from the note being edited rather than resetting to defaults.
        var existing = Note(id: 7, levelId: 2, title: "Old title", body: "Old body", isPinned: true);
        var query = new Mock<IQueryHandler<GetProductionNoteByIdQuery, ProductionNoteDto>>();
        query.Setup(h => h.Handle(It.IsAny<GetProductionNoteByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing));
        var handler = new Mock<ICommandHandler<UpdateProductionNoteCommand, ProductionNoteDto>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateProductionNoteCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing with { Body = "New body" }));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.UpdateProjectNote(
            query.Object, handler.Object, audit.Object, Caller(), projectId: 1, noteId: 7,
            idempotencyKey: "key-2", body: "New body");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<UpdateProductionNoteCommand>(c =>
                c.Title == "Old title" && c.Body == "New body" && c.IsPinned && c.LevelId == 2),
            It.IsAny<CancellationToken>()), Times.Once);
        // The prior note is what makes the write undoable.
        audit.Verify(a => a.CompleteAsync(
            "key-2", "gen-1", "ProductionNote", 7, It.IsAny<string>(),
            It.Is<string>(before => before.Contains("Old title")), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task ListProjectNotes_PinnedOnly_Asks_For_Pinned_Notes()
    {
        var handler = new Mock<IQueryHandler<GetProductionNotesQuery, IReadOnlyList<ProductionNoteDto>>>();
        handler.Setup(h => h.Handle(It.IsAny<GetProductionNotesQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success<IReadOnlyList<ProductionNoteDto>>(new[] { Note() }));

        var result = await ProjectReadMcpTools.ListProjectNotes(handler.Object, projectId: 1, pinnedOnly: true);

        Assert.Contains("notes", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<GetProductionNotesQuery>(q => q.ProjectId == 1 && q.IsPinned == true),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AddProjectReference_From_FileId_Adds_A_Titled_Reference_And_A_Linked_Note()
    {
        const int fileId = 42;
        var concept = new Mock<ICommandHandler<AddProjectConceptImageCommand>>();
        concept.Setup(h => h.Handle(It.IsAny<AddProjectConceptImageCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());

        // First read: the board is empty. Second read (after the add): the new reference.
        var references = new Mock<IQueryHandler<GetProjectReferencesQuery, IReadOnlyList<ProjectReferenceDto>>>();
        references.SetupSequence(h => h.Handle(It.IsAny<GetProjectReferencesQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success<IReadOnlyList<ProjectReferenceDto>>(Array.Empty<ProjectReferenceDto>()))
            .ReturnsAsync(Result.Success<IReadOnlyList<ProjectReferenceDto>>(new[] { Reference(11, fileId) }));

        var update = new Mock<ICommandHandler<UpdateProjectReferenceCommand, ProjectReferenceDto>>();
        update.Setup(h => h.Handle(It.IsAny<UpdateProjectReferenceCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Reference(11, fileId)));

        var note = new Mock<ICommandHandler<CreateProductionNoteCommand, ProductionNoteDto>>();
        note.Setup(h => h.Handle(It.IsAny<CreateProductionNoteCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Note(id: 9, referenceImageId: 11, title: "Hero", body: "The diver", isPinned: false)));
        var upload = new Mock<ICommandHandler<UploadFileCommand, UploadFileCommandResponse>>();
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddProjectReference(
            concept.Object, references.Object, update.Object, note.Object, upload.Object,
            audit.Object, Caller(), projectId: 1, title: "Hero", idempotencyKey: "key-4",
            note: "The diver", fileId: fileId);

        var json = Json(result);
        Assert.Contains("\"ok\"", json);
        Assert.Contains("11", json);
        Assert.Contains("9", json);
        concept.Verify(h => h.Handle(
            It.Is<AddProjectConceptImageCommand>(c => c.ProjectId == 1 && c.FileId == fileId),
            It.IsAny<CancellationToken>()), Times.Once);
        update.Verify(h => h.Handle(
            It.Is<UpdateProjectReferenceCommand>(c => c.ReferenceId == 11 && c.Title == "Hero"),
            It.IsAny<CancellationToken>()), Times.Once);
        note.Verify(h => h.Handle(
            It.Is<CreateProductionNoteCommand>(c => c.ProjectId == 1 && c.ReferenceImageId == 11 && c.Body == "The diver"),
            It.IsAny<CancellationToken>()), Times.Once);
        // A fileId means no bytes are read or uploaded.
        upload.Verify(h => h.Handle(It.IsAny<UploadFileCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AddProjectReference_Without_An_Image_Source_Returns_Upload_Instructions()
    {
        var concept = new Mock<ICommandHandler<AddProjectConceptImageCommand>>();
        var references = new Mock<IQueryHandler<GetProjectReferencesQuery, IReadOnlyList<ProjectReferenceDto>>>();
        var update = new Mock<ICommandHandler<UpdateProjectReferenceCommand, ProjectReferenceDto>>();
        var note = new Mock<ICommandHandler<CreateProductionNoteCommand, ProductionNoteDto>>();
        var upload = new Mock<ICommandHandler<UploadFileCommand, UploadFileCommandResponse>>();
        var audit = new Mock<IAgentAudit>();

        var result = await ProjectWriteMcpTools.AddProjectReference(
            concept.Object, references.Object, update.Object, note.Object, upload.Object,
            audit.Object, Caller(), projectId: 1, title: "Hero", idempotencyKey: "key-5");

        var json = Json(result);
        Assert.Contains("upload-required", json);
        Assert.Contains("POST /files", json);
        Assert.Contains("fileId", json);
        // Asking for instructions must not claim the key or touch anything.
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
        concept.Verify(h => h.Handle(It.IsAny<AddProjectConceptImageCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AddProjectLevel_Claims_The_Key_Then_Creates()
    {
        var handler = new Mock<ICommandHandler<CreateProjectLevelCommand, ProjectLevelDto>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateProjectLevelCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Level()));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddProjectLevel(
            handler.Object, audit.Object, Caller(), projectId: 1, name: "Flooded Temple",
            idempotencyKey: "key-6", description: "The opening level.", status: "InProgress");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<CreateProjectLevelCommand>(c =>
                c.ProjectId == 1 && c.Name == "Flooded Temple" && c.ProductionStatus == "InProgress"),
            It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-6", "gen-1", "ProjectLevel", 3, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateProjectLevel_Keeps_Omitted_Fields()
    {
        var existing = Level(id: 3, description: "Old", status: "Planned", sortOrder: 4);
        var query = new Mock<IQueryHandler<GetProjectLevelByIdQuery, ProjectLevelDto>>();
        query.Setup(h => h.Handle(It.IsAny<GetProjectLevelByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing));
        var handler = new Mock<ICommandHandler<UpdateProjectLevelCommand, ProjectLevelDto>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateProjectLevelCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Level(name: "Flooded Temple II")));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.UpdateProjectLevel(
            query.Object, handler.Object, audit.Object, Caller(), projectId: 1, levelId: 3,
            idempotencyKey: "key-7", name: "Flooded Temple II");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<UpdateProjectLevelCommand>(c =>
                c.Name == "Flooded Temple II" && c.Description == "Old"
                && c.ProductionStatus == "Planned" && c.SortOrder == 4),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AddProjectCharacter_Claims_The_Key_Then_Creates()
    {
        var handler = new Mock<ICommandHandler<CreateProjectCharacterCommand, ProjectCharacterDto>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateProjectCharacterCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Character()));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddProjectCharacter(
            handler.Object, audit.Object, Caller(), projectId: 1, name: "Mara",
            idempotencyKey: "key-8", description: "The diver.", tags: new[] { "protagonist", "diver" });

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<CreateProjectCharacterCommand>(c =>
                c.ProjectId == 1 && c.Name == "Mara" && c.Tags != null && c.Tags.Count == 2),
            It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-8", "gen-1", "ProjectCharacter", 5, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateProjectCharacter_Keeps_Omitted_Tags()
    {
        var existing = Character(id: 5, tags: new[] { "protagonist", "diver" });
        var query = new Mock<IQueryHandler<GetProjectCharacterByIdQuery, ProjectCharacterDto>>();
        query.Setup(h => h.Handle(It.IsAny<GetProjectCharacterByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing));
        var handler = new Mock<ICommandHandler<UpdateProjectCharacterCommand, ProjectCharacterDto>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateProjectCharacterCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Character(name: "Mara Vale")));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.UpdateProjectCharacter(
            query.Object, handler.Object, audit.Object, Caller(), projectId: 1, characterId: 5,
            idempotencyKey: "key-9", name: "Mara Vale");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<UpdateProjectCharacterCommand>(c =>
                c.Name == "Mara Vale" && c.Description == "The diver."
                && c.Tags != null && c.Tags.Count == 2),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
