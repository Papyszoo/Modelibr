using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Files;
using Application.Projects;
using Application.Projects.Profile;
using Domain.Models;
using Domain.Projects;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Unit tests for the project-studio MCP tools - comments, project membership, reference-board images, levels and
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

    private static ProjectCommentDto Comment(
        int id = 7,
        int projectId = 1,
        int? levelId = null,
        int? referenceImageId = null,
        int? characterId = null,
        int? modelId = null,
        string title = "Idea",
        string body = "Keep the opening area readable.",
        bool isPinned = true,
        string status = "open",
        string? resolution = null) =>
        new(id, projectId, levelId, referenceImageId, characterId, modelId, null, null, null, null, null,
            title, body, isPinned, status, resolution, Now, Now);

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

    /// <summary>A minimal brief, so the tool's response shape can be asserted on.</summary>
    private static ProjectBriefDto Brief(int id = 1) =>
        new(id, "Rift", null, null,
            Array.Empty<ProjectProfileValueDto>(), Array.Empty<ProjectProfileValueDto>(),
            Array.Empty<ProjectProfileValueDto>(), Array.Empty<ProjectProfileValueDto>(),
            Array.Empty<ProjectProfileValueDto>(),
            new ProjectBudgetDto(null, null, null, null),
            null,
            new ProjectWorldConventionDto(1, "Y", "right", true, Array.Empty<string>(), Array.Empty<string>()),
            new ProjectStyleSignalsDto(null, null, null, null, Array.Empty<string>(), Array.Empty<string>(), null, Array.Empty<string>()),
            Array.Empty<string>(),
            Array.Empty<ProjectConceptImageBriefDto>(), Array.Empty<ProjectEnvironmentMapBriefDto>(),
            Array.Empty<ProjectVfxBriefDto>(), Array.Empty<ProjectSceneBriefDto>(),
            new ProjectAssetCountsDto(0, 0, 0, 0, 0, 0, 0, 0),
            Array.Empty<string>());

    [Fact]
    public async Task SetProjectProfile_Sends_Dimensions_And_Settings_Then_Returns_The_Brief()
    {
        var handler = new Mock<ICommandHandler<SetProjectProfileCommand, ProjectBriefDto>>();
        handler.Setup(h => h.Handle(It.IsAny<SetProjectProfileCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Brief()));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.SetProjectProfile(
            handler.Object, audit.Object, Caller(), projectId: 1, idempotencyKey: "key-profile",
            dimensions:
            [
                new ProjectWriteMcpTools.ProfileDimensionInput(
                    "engine",
                    [new ProjectWriteMcpTools.ProfileAssignmentInput(7, "auth")]),
                // An entry with no options is a clear, not an omission to skip.
                new ProjectWriteMcpTools.ProfileDimensionInput("style", null),
            ],
            settings: new ProjectWriteMcpTools.ProfileSettingsInput(
                MaxTrianglesPerAsset: 15000, Clear: ["paletteHex"]));

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<SetProjectProfileCommand>(c =>
                c.ProjectId == 1
                && c.Dimensions != null
                && c.Dimensions["engine"].Single().OptionId == 7
                && c.Dimensions["engine"].Single().Role == "auth"
                && c.Dimensions["style"].Count == 0
                && c.Settings != null
                && c.Settings.MaxTrianglesPerAsset == 15000
                && c.Settings.Clear != null
                && c.Settings.Clear.Contains("paletteHex")),
            It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-profile", "gen-1", "Project", 1, It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SetProjectProfile_Reports_A_Refused_Dimension_And_Releases_The_Key()
    {
        var handler = new Mock<ICommandHandler<SetProjectProfileCommand, ProjectBriefDto>>();
        handler.Setup(h => h.Handle(It.IsAny<SetProjectProfileCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<ProjectBriefDto>(new Error("UnknownProfileDimension", "no")));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.SetProjectProfile(
            handler.Object, audit.Object, Caller(), projectId: 1, idempotencyKey: "key-dim",
            dimensions: [new ProjectWriteMcpTools.ProfileDimensionInput("vibe", null)]);

        Assert.Contains("UnknownProfileDimension", Json(result));
        audit.Verify(a => a.AbandonAsync("key-dim", "gen-1", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SetProjectProfile_Refuses_A_Repeated_Dimension()
    {
        // Two entries for one dimension make "cleared" and "filled" the same request,
        // decided by array order - refused rather than guessed.
        var handler = new Mock<ICommandHandler<SetProjectProfileCommand, ProjectBriefDto>>();

        var result = await ProjectWriteMcpTools.SetProjectProfile(
            handler.Object, ClaimGranted().Object, Caller(), projectId: 1, idempotencyKey: "key-dup",
            dimensions:
            [
                new ProjectWriteMcpTools.ProfileDimensionInput("style", null),
                new ProjectWriteMcpTools.ProfileDimensionInput("Style", null),
            ]);

        Assert.Contains("listed more than once", Json(result));
        handler.Verify(
            h => h.Handle(It.IsAny<SetProjectProfileCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AddProjectComment_Claims_The_Key_Then_Creates_With_Its_Asset_Target()
    {
        var handler = new Mock<ICommandHandler<CreateProjectCommentCommand, ProjectCommentDto>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateProjectCommentCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Comment(modelId: 12)));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddProjectComment(
            handler.Object, audit.Object, Caller(), projectId: 1, title: "Idea", body: "Too glossy",
            idempotencyKey: "key-1", pinned: true, modelId: 12);

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<CreateProjectCommentCommand>(c =>
                c.ProjectId == 1 && c.Title == "Idea" && c.Body == "Too glossy" && c.IsPinned
                && c.Target == new ProjectCommentTarget(null, null, null, 12, null, null, null, null, null)),
            It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-1", "gen-1", "ProjectComment", 7, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateProjectComment_Keeps_Omitted_Fields_And_Records_What_It_Replaced()
    {
        // The update command replaces the whole comment, so an omitted title/pinned/status
        // must come back from the comment being edited rather than resetting to defaults.
        var existing = Comment(id: 7, levelId: 2, title: "Old title", body: "Old body", isPinned: true);
        var query = new Mock<IQueryHandler<GetProjectCommentByIdQuery, ProjectCommentDto>>();
        query.Setup(h => h.Handle(It.IsAny<GetProjectCommentByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing));
        var handler = new Mock<ICommandHandler<UpdateProjectCommentCommand, ProjectCommentDto>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateProjectCommentCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing with { Body = "New body" }));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.UpdateProjectComment(
            query.Object, handler.Object, audit.Object, Caller(), projectId: 1, commentId: 7,
            idempotencyKey: "key-2", body: "New body");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<UpdateProjectCommentCommand>(c =>
                c.Title == "Old title" && c.Body == "New body" && c.IsPinned && c.Target.LevelId == 2
                && c.Status == "open" && c.Resolution == null),
            It.IsAny<CancellationToken>()), Times.Once);
        // The prior comment is what makes the write undoable.
        audit.Verify(a => a.CompleteAsync(
            "key-2", "gen-1", "ProjectComment", 7, It.IsAny<string>(),
            It.Is<string>(before => before.Contains("Old title")), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateProjectComment_Resolve_Sends_The_Status_And_Resolution()
    {
        var existing = Comment(id: 7, modelId: 12);
        var query = new Mock<IQueryHandler<GetProjectCommentByIdQuery, ProjectCommentDto>>();
        query.Setup(h => h.Handle(It.IsAny<GetProjectCommentByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing));
        var handler = new Mock<ICommandHandler<UpdateProjectCommentCommand, ProjectCommentDto>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateProjectCommentCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing with { Status = "resolved", Resolution = "Matte now." }));

        await ProjectWriteMcpTools.UpdateProjectComment(
            query.Object, handler.Object, ClaimGranted().Object, Caller(), projectId: 1, commentId: 7,
            idempotencyKey: "key-3", status: "resolved", resolution: "Matte now.");

        handler.Verify(h => h.Handle(
            It.Is<UpdateProjectCommentCommand>(c =>
                c.Status == "resolved" && c.Resolution == "Matte now." && c.Target.ModelId == 12),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task UpdateProjectComment_Reopen_Without_A_Resolution_Drops_The_Old_One()
    {
        // The stored resolution described the resolved state; carrying it into a reopen
        // would make the domain refuse the update.
        var existing = Comment(id: 7, status: "resolved", resolution: "Matte now.");
        var query = new Mock<IQueryHandler<GetProjectCommentByIdQuery, ProjectCommentDto>>();
        query.Setup(h => h.Handle(It.IsAny<GetProjectCommentByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing));
        var handler = new Mock<ICommandHandler<UpdateProjectCommentCommand, ProjectCommentDto>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateProjectCommentCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(existing with { Status = "open", Resolution = null }));

        await ProjectWriteMcpTools.UpdateProjectComment(
            query.Object, handler.Object, ClaimGranted().Object, Caller(), projectId: 1, commentId: 7,
            idempotencyKey: "key-3b", status: "open");

        handler.Verify(h => h.Handle(
            It.Is<UpdateProjectCommentCommand>(c => c.Status == "open" && c.Resolution == null),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ListProjectComments_Passes_Status_Pinned_And_Target_Filters()
    {
        var handler = new Mock<IQueryHandler<GetProjectCommentsQuery, IReadOnlyList<ProjectCommentDto>>>();
        handler.Setup(h => h.Handle(It.IsAny<GetProjectCommentsQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success<IReadOnlyList<ProjectCommentDto>>(new[] { Comment() }));

        var result = await ProjectReadMcpTools.ListProjectComments(
            handler.Object, projectId: 1, status: "open", pinnedOnly: true, vfxId: 4);

        Assert.Contains("comments", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<GetProjectCommentsQuery>(q =>
                q.ProjectId == 1 && q.IsPinned == true && q.Status == "open" && q.Target!.VfxId == 4 && q.Target.Count == 1),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AddToProject_Records_Membership_So_Undo_Knows_What_It_Added()
    {
        var handler = new Mock<ICommandHandler<AddAssetToProjectCommand, AddAssetToProjectResponse>>();
        handler.Setup(h => h.Handle(new AddAssetToProjectCommand(1, "vfx", 4), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AddAssetToProjectResponse(1, "vfx", 4, WasMember: false)));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddToProject(
            handler.Object, audit.Object, Caller(), projectId: 1, assetType: "vfx", assetId: 4, idempotencyKey: "key-p");

        Assert.Contains("\"ok\"", Json(result));
        audit.Verify(a => a.CompleteAsync(
            "key-p", "gen-1", "vfx", 4,
            It.Is<string>(after => after.Contains("\"projectId\":1") && after.Contains("\"assetType\":\"vfx\"")),
            It.Is<string>(before => before.Contains("\"wasMember\":false")),
            It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task AddToProject_Reports_A_Refused_Type_As_A_Failure()
    {
        var handler = new Mock<ICommandHandler<AddAssetToProjectCommand, AddAssetToProjectResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AddAssetToProjectCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<AddAssetToProjectResponse>(new Error("UnknownProjectAssetType", "no")));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddToProject(
            handler.Object, audit.Object, Caller(), projectId: 1, assetType: "script", assetId: 4, idempotencyKey: "key-q");

        Assert.Contains("UnknownProjectAssetType", Json(result));
        audit.Verify(a => a.CompleteAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task LinkCharacterModel_Links_With_The_Label()
    {
        var handler = new Mock<ICommandHandler<AddProjectCharacterModelCommand, ProjectCharacterModelDto>>();
        handler.Setup(h => h.Handle(It.IsAny<AddProjectCharacterModelCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new ProjectCharacterModelDto(21, 12, "Courier rig", "Default outfit", 0)));
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.LinkCharacterModel(
            handler.Object, audit.Object, Caller(), projectId: 1, characterId: 5, modelId: 12,
            idempotencyKey: "key-l", label: "Default outfit");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            new AddProjectCharacterModelCommand(1, 5, 12, "Default outfit", null),
            It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-l", "gen-1", "ProjectCharacter", 5, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task AddProjectReference_From_FileId_Adds_A_Titled_Reference_And_A_Linked_Comment()
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

        var comment = new Mock<ICommandHandler<CreateProjectCommentCommand, ProjectCommentDto>>();
        comment.Setup(h => h.Handle(It.IsAny<CreateProjectCommentCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Comment(id: 9, referenceImageId: 11, title: "Hero", body: "The diver", isPinned: false)));
        var upload = new Mock<ICommandHandler<UploadFileCommand, UploadFileCommandResponse>>();
        var audit = ClaimGranted();

        var result = await ProjectWriteMcpTools.AddProjectReference(
            concept.Object, references.Object, update.Object, comment.Object, upload.Object,
            audit.Object, Caller(), projectId: 1, title: "Hero", idempotencyKey: "key-4",
            comment: "The diver", fileId: fileId);

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
        comment.Verify(h => h.Handle(
            It.Is<CreateProjectCommentCommand>(c => c.ProjectId == 1 && c.Target.ReferenceImageId == 11 && c.Body == "The diver"),
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
        var comment = new Mock<ICommandHandler<CreateProjectCommentCommand, ProjectCommentDto>>();
        var upload = new Mock<ICommandHandler<UploadFileCommand, UploadFileCommandResponse>>();
        var audit = new Mock<IAgentAudit>();

        var result = await ProjectWriteMcpTools.AddProjectReference(
            concept.Object, references.Object, update.Object, comment.Object, upload.Object,
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
