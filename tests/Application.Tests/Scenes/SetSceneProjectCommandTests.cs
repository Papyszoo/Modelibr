using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Scenes;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Scenes;

public class SetSceneProjectCommandTests
{
    private static readonly DateTime Now = new(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<ISceneRepository> _scenes = new();
    private readonly Mock<IProjectRepository> _projects = new();
    private readonly SetSceneProjectCommandHandler _handler;

    public SetSceneProjectCommandTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        _handler = new SetSceneProjectCommandHandler(
            _scenes.Object, _projects.Object, clock.Object, new Mock<IUnitOfWork>().Object);
    }

    private static Scene NewScene()
        => Scene.Create("Living Room", "{\"schemaVersion\":1}", 1, Now).Value;

    private void GivenScene(Scene scene)
        => _scenes.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(scene);

    private void GivenProject(int id, string name)
        => _projects.Setup(r => r.GetByIdAsync(id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create(name, null, Now));

    [Fact]
    public async Task LinkingAScene_BumpsTheRevision()
    {
        var scene = NewScene();
        var before = scene.Revision;
        GivenScene(scene);
        GivenProject(7, "Nightfall");

        var result = await _handler.Handle(new SetSceneProjectCommand(1, 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(7, scene.ProjectId);
        // The revision is the token the editor watches. A link change that left it alone
        // would leave the editor showing one project's brief while the agent read another's.
        Assert.Equal(before + 1, scene.Revision);
    }

    [Fact]
    public async Task RelinkingToTheSameProject_DoesNotBumpTheRevision()
    {
        var scene = NewScene();
        GivenScene(scene);
        GivenProject(7, "Nightfall");
        await _handler.Handle(new SetSceneProjectCommand(1, 7), CancellationToken.None);
        var after = scene.Revision;

        var result = await _handler.Handle(new SetSceneProjectCommand(1, 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        // An idempotent call that moved the token would invalidate every open editor for no
        // change at all.
        Assert.Equal(after, scene.Revision);
    }

    [Fact]
    public async Task TheResponse_CarriesThePreviousLinkSoTheWriteCanBeUndone()
    {
        var scene = NewScene();
        GivenScene(scene);
        GivenProject(7, "Nightfall");
        GivenProject(9, "Daybreak");
        await _handler.Handle(new SetSceneProjectCommand(1, 7), CancellationToken.None);

        var result = await _handler.Handle(new SetSceneProjectCommand(1, 9), CancellationToken.None);

        Assert.Equal(7, result.Value.PreviousProjectId);
        Assert.Equal(9, result.Value.ProjectId);
    }

    [Fact]
    public async Task UnlinkingIsAllowed()
    {
        var scene = NewScene();
        GivenScene(scene);
        GivenProject(7, "Nightfall");
        await _handler.Handle(new SetSceneProjectCommand(1, 7), CancellationToken.None);

        var result = await _handler.Handle(new SetSceneProjectCommand(1, null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(scene.ProjectId);
    }

    [Fact]
    public async Task AProjectThatDoesNotExist_IsRefusedAndChangesNothing()
    {
        var scene = NewScene();
        GivenScene(scene);
        _projects.Setup(r => r.GetByIdAsync(42, It.IsAny<CancellationToken>())).ReturnsAsync((Project?)null);

        var result = await _handler.Handle(new SetSceneProjectCommand(1, 42), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectNotFound", result.Error.Code);
        Assert.Null(scene.ProjectId);
    }

    [Fact]
    public async Task ASceneThatDoesNotExist_IsRefused()
    {
        _scenes.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync((Scene?)null);

        var result = await _handler.Handle(new SetSceneProjectCommand(1, 7), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("SceneNotFound", result.Error.Code);
    }
}
