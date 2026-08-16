using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
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
    private readonly Mock<ISceneDocumentCommit> _commit = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly SceneWriter _writer;

    public SceneWriterTests()
    {
        _clock.SetupGet(c => c.UtcNow).Returns(Now);
        _facts.Setup(f => f.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal));
        _facts.Setup(f => f.FindUnresolvableAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SceneAssetReferenceProblem>());
        _commit.Setup(c => c.SaveAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Result.Success());

        _writer = new SceneWriter(_scenes.Object, _facts.Object, _commit.Object, _clock.Object);
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


    [Fact]
    public async Task ApplyAsync_When_A_Concurrent_Write_Won_Reports_A_Revision_Conflict()
    {
        // The in-memory revision check above passes for BOTH of two concurrent writers - they
        // read N, they both write N+1, and one edit vanishes. The database's concurrency
        // token is what actually catches it, and this is that verdict reaching the caller.
        GivenScene();
        _commit.Setup(c => c.SaveAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure(new Error("Scene.RevisionConflict", "Someone else committed first.")));

        var result = await _writer.ApplyAsync(
            1, null, document => Result.Success(document with { Nodes = new[] { ModelNode("lamp") } }));

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.RevisionConflict", result.Error.Code);
    }

    [Fact]
    public async Task ApplyAsync_Refuses_A_Write_That_Introduces_A_Reference_To_Nothing()
    {
        // A placement against a mistyped id used to succeed and produce a document the editor
        // could never load, with nothing anywhere saying why.
        GivenScene();
        var missing = new SceneAssetRef(SceneAssetTypes.Model, 404, 9);
        _facts.Setup(f => f.FindUnresolvableAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new SceneAssetReferenceProblem(missing, "There is no model version 9.")]);

        var result = await _writer.ApplyAsync(
            1,
            null,
            document => Result.Success(document with
            {
                Nodes = new[] { new SceneNode("ghost", SceneTransform.Identity, Asset: missing) },
            }));

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.AssetNotFound", result.Error.Code);
        _scenes.Verify(s => s.UpdateAsync(It.IsAny<Scene>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ApplyAsync_Skips_The_Reference_Check_When_The_Caller_Is_Restoring_State()
    {
        // Undo restores what was legal when it was recorded. Refusing to put a node back
        // because its asset has since been recycled would turn a rendering problem into an
        // undo that cannot run at all.
        GivenScene()
;
        var missing = new SceneAssetRef(SceneAssetTypes.Model, 404, 9);
        _facts.Setup(f => f.FindUnresolvableAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new SceneAssetReferenceProblem(missing, "There is no model version 9.")]);

        var result = await _writer.ApplyAsync(
            1,
            null,
            document => Result.Success(document with
            {
                Nodes = new[] { new SceneNode("restored", SceneTransform.Identity, Asset: missing) },
            }),
            CancellationToken.None,
            verifyNewReferences: false);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task ApplyAsync_Does_Not_Check_References_The_Document_Already_Had()
    {
        // Only what a write INTRODUCES is checked. An asset recycled after it was placed must
        // not make the scene unable to be edited - including by the edit that removes it.
        var scene = GivenScene(SceneDocument.Empty() with { Nodes = new[] { ModelNode("lamp") } });

        var result = await _writer.ApplyAsync(
            1, null, document => Result.Success(document with { Nodes = Array.Empty<SceneNode>() }));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, scene.Revision);
        _facts.Verify(
            f => f.FindUnresolvableAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
