using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Scenes;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Scenes;

public class SetSceneLevelCommandTests
{
    private static readonly DateTime Now = new(2026, 9, 25, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task LinkingToTheSameLevelTwice_IsIdempotent()
    {
        var scene = Scene.Create("Crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        var handler = Handler(scene, out _, out _, projectId: 1, levelId: 2);
        var first = await handler.Handle(
            new SetSceneLevelCommand(1, 2, IsPrimary: true, ExpectedRevision: 1),
            CancellationToken.None);
        var revision = first.Value.Revision;

        var second = await handler.Handle(
            new SetSceneLevelCommand(1, 2, IsPrimary: true, ExpectedRevision: revision),
            CancellationToken.None);

        Assert.True(second.IsSuccess);
        Assert.Equal(revision, second.Value.Revision);
        Assert.Equal(2, scene.ProjectLevelId);
        Assert.True(scene.IsPrimaryLevelScene);
    }

    [Fact]
    public async Task LinkingAsPrimary_ClearsThePreviousPrimaryScene()
    {
        var scene = Scene.Create("New crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        var previousPrimary = Scene.Create("Old crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        SetId(scene, 1);
        SetId(previousPrimary, 2);
        previousPrimary.SetLevel(2, isPrimary: true, Now);

        var scenes = new Mock<ISceneRepository>();
        scenes.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(scene);
        scenes.Setup(r => r.GetPrimaryByLevelAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(previousPrimary);
        var levels = new Mock<IProjectLevelRepository>();
        levels.Setup(r => r.GetByIdAsync(1, 2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ProjectLevel.Create(1, "Crossing", null, ProjectLevelStatuses.Planned, 0, Now));
        var handler = new SetSceneLevelCommandHandler(
            scenes.Object,
            levels.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new SetSceneLevelCommand(1, 2, IsPrimary: true),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(previousPrimary.IsPrimaryLevelScene);
        Assert.Equal(2, previousPrimary.ProjectLevelId);
        Assert.True(scene.IsPrimaryLevelScene);
        Assert.Equal(2, scene.ProjectLevelId);
    }

    [Fact]
    public async Task LinkingWhenExpectedRevisionIsStale_IsRefused()
    {
        var scene = Scene.Create("Crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        var handler = Handler(scene, out _, out _, projectId: 1, levelId: 2);

        var result = await handler.Handle(
            new SetSceneLevelCommand(1, 2, ExpectedRevision: 99),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.RevisionConflict", result.Error.Code);
        Assert.Null(scene.ProjectLevelId);
    }

    [Fact]
    public async Task LinkingWithoutALevel_CannotRequestPrimaryStatus()
    {
        var scene = Scene.Create("Crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        var handler = Handler(scene, out _, out _, projectId: 1, levelId: null);

        var result = await handler.Handle(
            new SetSceneLevelCommand(1, null, IsPrimary: true),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.PrimaryLevelRequiresLevel", result.Error.Code);
    }

    [Fact]
    public async Task LinkingToAnotherProjectsLevel_IsRefused()
    {
        var scene = Scene.Create("Crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        var handler = Handler(scene, out _, out _, projectId: 1, levelId: null);

        var result = await handler.Handle(
            new SetSceneLevelCommand(1, 2),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("SceneLevelProjectMismatch", result.Error.Code);
        Assert.Null(scene.ProjectLevelId);
    }

    [Fact]
    public async Task ChangingProject_WhenSceneIsLevelLinked_IsRefused()
    {
        var scene = Scene.Create("Crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        scene.SetLevel(2, isPrimary: true, Now);
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(9, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Daybreak", null, Now));
        var repository = new Mock<ISceneRepository>();
        repository.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(scene);
        var handler = new SetSceneProjectCommandHandler(
            repository.Object,
            projects.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new SetSceneProjectCommand(1, 9), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("SceneLevelProjectMismatch", result.Error.Code);
        Assert.Equal(1, scene.ProjectId);
    }

    private static void SetId(Scene scene, int id)
    {
        typeof(Scene)
            .GetProperty(nameof(Scene.Id))!
            .SetValue(scene, id);
    }

    private static SetSceneLevelCommandHandler Handler(
        Scene scene,
        out Mock<ISceneRepository> scenes,
        out Mock<IProjectLevelRepository> levels,
        int projectId,
        int? levelId)
    {
        scenes = new Mock<ISceneRepository>();
        levels = new Mock<IProjectLevelRepository>();
        scenes.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(scene);
        if (levelId.HasValue)
        {
            levels.Setup(r => r.GetByIdAsync(projectId, levelId.Value, It.IsAny<CancellationToken>()))
                .ReturnsAsync(ProjectLevel.Create(
                    projectId, $"Level {levelId}", null, ProjectLevelStatuses.Planned, 0, Now));
        }

        return new SetSceneLevelCommandHandler(
            scenes.Object,
            levels.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);
    }

    private static IDateTimeProvider Clock()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        return clock.Object;
    }
}
