using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Projects;
using Application.Tests;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Projects;

/// <summary>
/// Comment status and asset targets, a project's VFX membership, the by-type project
/// membership the add_to_project tool routes through, and linking a character's model.
/// </summary>
public class ProjectCommentCommandTests
{
    private static readonly DateTime Now = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);

    private static IDateTimeProvider Clock()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        return clock.Object;
    }

    private static ProjectComment StoredComment(ProjectCommentTarget? target = null)
        => ProjectComment.Create(1, target ?? new ProjectCommentTarget(ModelId: 5), "Scale", "Too large next to the door.", false, Now.AddDays(-1))
            .WithId(9);

    private static (UpdateProjectCommentCommandHandler Handler, Mock<IProjectCommentRepository> Comments) UpdateHandler(
        ProjectComment stored)
    {
        var comments = new Mock<IProjectCommentRepository>();
        comments.Setup(r => r.GetByIdAsync(1, 9, It.IsAny<CancellationToken>())).ReturnsAsync(stored);
        comments.Setup(r => r.TargetExistsAsync(1, It.IsAny<ProjectCommentTarget>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return (new UpdateProjectCommentCommandHandler(comments.Object, Clock(), new Mock<IUnitOfWork>().Object), comments);
    }

    [Fact]
    public async Task UpdateProjectComment_Resolve_RecordsTheResolution_And_Reopen_ClearsIt()
    {
        var stored = StoredComment();
        var (handler, _) = UpdateHandler(stored);
        var target = new ProjectCommentTarget(ModelId: 5);

        var resolved = await handler.Handle(new UpdateProjectCommentCommand(
            1, 9, target, "Scale", "Too large next to the door.", false, "resolved", "Scaled to 0.5."), CancellationToken.None);

        Assert.True(resolved.IsSuccess);
        Assert.Equal("resolved", resolved.Value.Status);
        Assert.Equal("Scaled to 0.5.", resolved.Value.Resolution);
        Assert.Equal(5, resolved.Value.ModelId);

        var reopened = await handler.Handle(new UpdateProjectCommentCommand(
            1, 9, target, "Scale", "Too large next to the door.", false, "open"), CancellationToken.None);

        Assert.True(reopened.IsSuccess);
        Assert.Equal("open", reopened.Value.Status);
        Assert.Null(reopened.Value.Resolution);
    }

    [Fact]
    public async Task UpdateProjectComment_WithoutAStatus_KeepsTheStatusAndResolution()
    {
        // Editing the text of a resolved comment must not quietly reopen it: the UI's edit
        // form sends no status.
        var stored = StoredComment();
        stored.SetStatus(ProjectCommentStatuses.Resolved, "Scaled to 0.5.", Now);
        var (handler, _) = UpdateHandler(stored);

        var result = await handler.Handle(new UpdateProjectCommentCommand(
            1, 9, new ProjectCommentTarget(ModelId: 5), "Scale", "Edited body.", false), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Edited body.", result.Value.Body);
        Assert.Equal("resolved", result.Value.Status);
        Assert.Equal("Scaled to 0.5.", result.Value.Resolution);
    }

    [Fact]
    public async Task UpdateProjectComment_WithAnUnknownStatus_IsRefused()
    {
        var (handler, comments) = UpdateHandler(StoredComment());

        var result = await handler.Handle(new UpdateProjectCommentCommand(
            1, 9, new ProjectCommentTarget(ModelId: 5), "Scale", "Body", false, "archived"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidProjectComment", result.Error.Code);
        comments.Verify(r => r.UpdateAsync(It.IsAny<ProjectComment>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateProjectComment_WhenTheTargetAssetDoesNotExist_NamesTheAsset()
    {
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Sample project", null, Now));
        var comments = new Mock<IProjectCommentRepository>();
        comments.Setup(r => r.TargetExistsAsync(1, It.Is<ProjectCommentTarget>(t => t.VfxId == 4 && t.Count == 1), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var handler = new CreateProjectCommentCommandHandler(
            projects.Object, comments.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new CreateProjectCommentCommand(
            1, new ProjectCommentTarget(VfxId: 4), "Timing", "The flash lands late.", false), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectCommentTargetNotFound", result.Error.Code);
        Assert.Equal("VFX 4 was not found.", result.Error.Message);
        comments.Verify(r => r.AddAsync(It.IsAny<ProjectComment>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetProjectComments_PassesTheStatusAndTargetFilters_Normalized()
    {
        var comments = new Mock<IProjectCommentRepository>();
        ProjectCommentFilter? seen = null;
        comments.Setup(r => r.GetForProjectAsync(1, It.IsAny<ProjectCommentFilter>(), It.IsAny<CancellationToken>()))
            .Callback<int, ProjectCommentFilter, CancellationToken>((_, filter, _) => seen = filter)
            .ReturnsAsync(Array.Empty<ProjectComment>());
        var handler = new GetProjectCommentsQueryHandler(comments.Object);

        var result = await handler.Handle(
            new GetProjectCommentsQuery(1, new ProjectCommentTarget(SoundId: 3), null, "Resolved"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new ProjectCommentFilter(new ProjectCommentTarget(SoundId: 3), null, "resolved"), seen);
    }

    [Fact]
    public async Task GetProjectComments_WithAnUnknownStatus_IsRefused()
    {
        var handler = new GetProjectCommentsQueryHandler(new Mock<IProjectCommentRepository>().Object);

        var result = await handler.Handle(new GetProjectCommentsQuery(1, Status: "closed"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidProjectCommentStatus", result.Error.Code);
    }

    [Fact]
    public async Task AddVfxToProject_AddsTheEffectToTheProject()
    {
        var project = Project.Create("Sample project", null, Now).WithId(1);
        var vfx = Domain.Models.Vfx.Create("Spark burst", null, "{}", Now).WithId(4);
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(project);
        var effects = new Mock<IVfxRepository>();
        effects.Setup(r => r.GetByIdAsync(4, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);
        var handler = new AddVfxToProjectCommandHandler(
            projects.Object, effects.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new AddVfxToProjectCommand(1, 4), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(project.HasVfx(4));
        Assert.Equal(1, project.VfxCount);
    }

    [Fact]
    public async Task RemoveVfxFromProject_RemovesTheEffect()
    {
        var project = Project.Create("Sample project", null, Now).WithId(1);
        var vfx = Domain.Models.Vfx.Create("Spark burst", null, "{}", Now).WithId(4);
        project.AddVfx(vfx, Now);
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(project);
        var effects = new Mock<IVfxRepository>();
        effects.Setup(r => r.GetByIdAsync(4, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);
        var handler = new RemoveVfxFromProjectCommandHandler(
            projects.Object, effects.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new RemoveVfxFromProjectCommand(1, 4), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(project.HasVfx(4));
    }

    [Fact]
    public async Task AddVfxToProject_WhenTheEffectDoesNotExist_IsRefused()
    {
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Sample project", null, Now));
        var handler = new AddVfxToProjectCommandHandler(
            projects.Object, new Mock<IVfxRepository>().Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new AddVfxToProjectCommand(1, 4), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("VfxNotFound", result.Error.Code);
    }

    private sealed class AssetMembershipHandlers
    {
        public Mock<IProjectRepository> Projects { get; } = new();
        public Mock<ICommandHandler<AddModelToProjectCommand>> Model { get; } = new();
        public Mock<ICommandHandler<AddTextureSetToProjectCommand>> TextureSet { get; } = new();
        public Mock<ICommandHandler<AddSpriteToProjectCommand>> Sprite { get; } = new();
        public Mock<ICommandHandler<AddSoundToProjectCommand>> Sound { get; } = new();
        public Mock<ICommandHandler<AddEnvironmentMapToProjectCommand>> EnvironmentMap { get; } = new();
        public Mock<ICommandHandler<AddVfxToProjectCommand>> Vfx { get; } = new();

        public AddAssetToProjectCommandHandler Create() => new(
            Projects.Object, Model.Object, TextureSet.Object, Sprite.Object,
            Sound.Object, EnvironmentMap.Object, Vfx.Object);
    }

    [Fact]
    public async Task AddAssetToProject_RoutesAVfxToTheVfxHandler_AndReportsItWasNotAMember()
    {
        var handlers = new AssetMembershipHandlers();
        handlers.Projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Sample project", null, Now).WithId(1));
        handlers.Vfx.Setup(h => h.Handle(new AddVfxToProjectCommand(1, 4), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());

        var result = await handlers.Create().Handle(new AddAssetToProjectCommand(1, "VFX", 4), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new AddAssetToProjectResponse(1, "vfx", 4, WasMember: false), result.Value);
        handlers.Model.Verify(h => h.Handle(It.IsAny<AddModelToProjectCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AddAssetToProject_ReportsAnExistingMember_SoUndoLeavesItInPlace()
    {
        var project = Project.Create("Sample project", null, Now).WithId(1);
        project.AddModel(Model.Create("Crate", Now).WithId(7), Now);
        var handlers = new AssetMembershipHandlers();
        handlers.Projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(project);
        handlers.Model.Setup(h => h.Handle(new AddModelToProjectCommand(1, 7), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());

        var result = await handlers.Create().Handle(new AddAssetToProjectCommand(1, "model", 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.WasMember);
    }

    [Theory]
    [InlineData("texture-set", "textureSet")]
    [InlineData("Environment Map", "environmentMap")]
    [InlineData("SOUND", "sound")]
    public void ProjectAssetTypes_Normalize_AcceptsCommonSpellings(string input, string expected)
    {
        Assert.Equal(expected, ProjectAssetTypes.Normalize(input));
    }

    [Fact]
    public async Task AddAssetToProject_WithAnUnknownType_IsRefusedBeforeAnyWrite()
    {
        var handlers = new AssetMembershipHandlers();

        var result = await handlers.Create().Handle(new AddAssetToProjectCommand(1, "script", 2), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("UnknownProjectAssetType", result.Error.Code);
        handlers.Projects.Verify(r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AddProjectCharacterModel_AlsoAddsTheModelToTheProject()
    {
        var project = Project.Create("Sample project", null, Now).WithId(1);
        var character = ProjectCharacter.Create(1, "Courier", null, Now).WithId(3);
        var model = Model.Create("Courier rig", Now).WithId(7);
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(project);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 3, It.IsAny<CancellationToken>())).ReturnsAsync(character);
        var models = new Mock<IModelRepository>();
        models.Setup(r => r.GetByIdForAssociationAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        var handler = new AddProjectCharacterModelCommandHandler(
            projects.Object, characters.Object, models.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new AddProjectCharacterModelCommand(1, 3, 7, "Default outfit"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Default outfit", result.Value.Label);
        Assert.True(project.HasModel(7));
        projects.Verify(r => r.UpdateAsync(project, It.IsAny<CancellationToken>()), Times.Once);
    }
}
