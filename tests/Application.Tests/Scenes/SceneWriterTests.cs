using Application.Abstractions.Repositories;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Domain.Services;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The load → parse → mutate → validate → save cycle every scene edit runs.
///
/// The load-bearing assertion is that a mutation producing an invalid document never
/// reaches the repository: without it, a handler is one refactor away from persisting a
/// scene with two nodes sharing an id.
/// </summary>
public class SceneWriterTests
{
    private static readonly DateTime Now = new(2026, 8, 16, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<ISceneRepository> _scenes = new();
    private readonly Mock<ISceneAssetFacts> _facts = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly SceneWriter _writer;

    public SceneWriterTests()
    {
        _clock.SetupGet(c => c.UtcNow).Returns(Now);
        _facts.Setup(f => f.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal));

        _writer = new SceneWriter(_scenes.Object, _facts.Object, _clock.Object);
    }

    private Scene GivenScene(SceneDocument? document = null, int id = 1)
    {
        var scene = Scene.Create(
            "Street",
            SceneDocumentCodec.Serialize(document ?? SceneDocument.Empty()),
            SceneDocument.CurrentSchemaVersion,
            Now).Value;

        typeof(Scene).GetProperty(nameof(Scene.Id))!.SetValue(scene, id);
        _scenes.Setup(s => s.GetByIdAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync(scene);
        return scene;
    }

    private static SceneNode ModelNode(string id, int assetId = 1) =>
        new(id, SceneTransform.Identity, Asset: new SceneAssetRef(SceneAssetTypes.Model, assetId, 1));

    [Fact]
    public async Task ApplyAsync_When_The_Scene_Does_Not_Exist_Returns_NotFound()
    {
        _scenes.Setup(s => s.GetByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((Scene?)null);

        var result = await _writer.ApplyAsync(99, null, Result.Success);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.NotFound", result.Error.Code);
    }

    [Fact]
    public async Task ApplyAsync_When_A_Mutation_Succeeds_Stores_It_And_Bumps_The_Revision()
    {
        var scene = GivenScene();

        var result = await _writer.ApplyAsync(
            1, null, document => Result.Success(document with { Nodes = new[] { ModelNode("lamp") } }));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, scene.Revision);
        Assert.Equal(Now, scene.UpdatedAt);
        Assert.Contains("lamp", scene.DocumentJson);
        _scenes.Verify(s => s.UpdateAsync(scene, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ApplyAsync_When_The_Mutation_Produces_An_Invalid_Document_Does_Not_Save()
    {
        var scene = GivenScene();
        var before = scene.DocumentJson;

        var result = await _writer.ApplyAsync(
            1,
            null,
            document => Result.Success(document with { Nodes = new[] { ModelNode("lamp"), ModelNode("lamp", assetId: 2) } }));

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.DocumentInvalid", result.Error.Code);
        Assert.Equal(before, scene.DocumentJson);
        Assert.Equal(1, scene.Revision);
        _scenes.Verify(s => s.UpdateAsync(It.IsAny<Scene>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ApplyAsync_When_The_Expected_Revision_Does_Not_Match_Refuses_The_Write()
    {
        var scene = GivenScene();

        var result = await _writer.ApplyAsync(
            1, expectedRevision: 7, document => Result.Success(document with { Nodes = new[] { ModelNode("lamp") } }));

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.RevisionConflict", result.Error.Code);
        Assert.Equal(1, scene.Revision);
        _scenes.Verify(s => s.UpdateAsync(It.IsAny<Scene>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ApplyAsync_When_The_Expected_Revision_Matches_Applies_The_Write()
    {
        GivenScene();

        var result = await _writer.ApplyAsync(
            1, expectedRevision: 1, document => Result.Success(document with { Nodes = new[] { ModelNode("lamp") } }));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task ApplyAsync_When_The_Mutation_Fails_Leaves_The_Scene_Alone()
    {
        var scene = GivenScene();

        var result = await _writer.ApplyAsync(
            1, null, _ => Result.Failure<SceneDocument>(new Error("Scene.NodeNotFound", "no such node")));

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.NodeNotFound", result.Error.Code);
        Assert.Equal(1, scene.Revision);
        _scenes.Verify(s => s.UpdateAsync(It.IsAny<Scene>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task LoadAsync_When_The_Stored_Document_Is_Unreadable_Reports_It_As_A_Data_Problem()
    {
        var scene = Scene.Create("Broken", "{ not a scene", SceneDocument.CurrentSchemaVersion, Now).Value;
        typeof(Scene).GetProperty(nameof(Scene.Id))!.SetValue(scene, 5);
        _scenes.Setup(s => s.GetByIdAsync(5, It.IsAny<CancellationToken>())).ReturnsAsync(scene);

        var result = await _writer.LoadAsync(5);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.StoredDocumentUnreadable", result.Error.Code);
    }
}
