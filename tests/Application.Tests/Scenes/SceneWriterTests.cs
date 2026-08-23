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
    private readonly Mock<ISceneAssetUsageRepository> _usage = new();
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

        _writer = new SceneWriter(_scenes.Object, _facts.Object, _commit.Object, _clock.Object, _usage.Object);
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

    /// <summary>A sofa-sized asset with its base at its origin, so grounding arithmetic is checkable.</summary>
    private void GivenFactsFor(int assetId, Vec3 dimensions)
    {
        var reference = new SceneAssetRef(SceneAssetTypes.Model, assetId, 1);
        _facts.Setup(f => f.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal)
            {
                [SceneSpatial.FactsKey(reference)] =
                    new SceneAssetFacts(SceneAssetTypes.Model, assetId, 1, dimensions, OriginInBounds: new Vec3(0.5, 0, 0.5)),
            });
    }

    /// <summary>
    /// A node in mid-air with nothing under it and nothing said about why.
    ///
    /// Not a broken groundSnap on purpose: ResolvePlacements runs on every write and would put
    /// that one back on the floor before the gate ever saw it. The undeclared floater is the
    /// one that survives a write, and it is the one the living-room run shipped.
    /// </summary>
    private static SceneNode FloatingNode(string id) =>
        new(
            id,
            new SceneTransform(new Vec3(0, 3, 0), Vec3.Zero, Vec3.One),
            Asset: new SceneAssetRef(SceneAssetTypes.Model, 1, 1));

    [Fact]
    public async Task ApplyAsync_Refuses_To_Advance_The_Stage_Over_A_Broken_Composition()
    {
        // The mechanism the staged workflow rests on. Without it the stages are a comment,
        // and the run this comes from tuned four lighting setups over a room in which every
        // object floated half its height.
        var scene = GivenScene(SceneDocument.Empty() with
        {
            Nodes = new[] { FloatingNode("sofa") },
            Stage = SceneStages.Layout,
        });
        GivenFactsFor(1, new Vec3(1.6, 0.8, 0.9));

        var result = await _writer.ApplyAsync(
            1, null, document => Result.Success(document with { Stage = SceneStages.Dressed }));

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.StageBlocked", result.Error.Code);
        Assert.Contains("Contact.Unsupported", result.Error.Message);
        Assert.Contains("suspended=true", result.Error.Message);
        _scenes.Verify(s => s.UpdateAsync(It.IsAny<Scene>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ApplyAsync_Lets_A_Broken_Scene_Retreat_To_An_Earlier_Stage()
    {
        // Going back is how a scene is reopened to fix what the gate refused it for.
        GivenScene(SceneDocument.Empty() with
        {
            Nodes = new[] { FloatingNode("sofa") },
            Stage = SceneStages.Dressed,
        });
        GivenFactsFor(1, new Vec3(1.6, 0.8, 0.9));

        var result = await _writer.ApplyAsync(
            1, null, document => Result.Success(document with { Stage = SceneStages.Layout }));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task ApplyAsync_Does_Not_Gate_A_Write_That_Leaves_The_Stage_Alone()
    {
        // An ordinary placement into a half-built scene is not the moment to demand that the
        // scene be finished.
        GivenScene(SceneDocument.Empty() with
        {
            Nodes = new[] { FloatingNode("sofa") },
            Stage = SceneStages.Layout,
        });
        GivenFactsFor(1, new Vec3(1.6, 0.8, 0.9));

        var result = await _writer.ApplyAsync(
            1,
            null,
            document => Result.Success(document with { Nodes = document.Nodes.Append(ModelNode("lamp")).ToArray() }));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task ApplyAsync_Lets_A_Declared_Hanging_Node_Through_The_Gate()
    {
        // The escape that makes the gate a question rather than a wall. Saying so is a durable
        // fact about the node, so a room with three pendant lamps does not re-argue it at
        // every stage.
        GivenScene(SceneDocument.Empty() with
        {
            Nodes = new[] { FloatingNode("pendant") with { Suspended = true } },
            Stage = SceneStages.Layout,
        });
        GivenFactsFor(1, new Vec3(0.3, 0.4, 0.3));

        var result = await _writer.ApplyAsync(
            1, null, document => Result.Success(document with { Stage = SceneStages.Dressed }));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task ApplyAsync_Reports_The_Warnings_A_Stage_Advance_Carried_Forward()
    {
        // Containment does not block - nothing in the document can declare a sunken floor
        // deliberate - so it comes back on the response instead, said once, at the moment the
        // caller committed to the stage.
        GivenScene(SceneDocument.Empty() with
        {
            Nodes = new[]
            {
                new SceneNode(
                    "pool",
                    new SceneTransform(new Vec3(0, -1.2, 0), Vec3.Zero, Vec3.One),
                    Asset: new SceneAssetRef(SceneAssetTypes.Model, 1, 1)),
            },
            Stage = SceneStages.Lit,
        });
        GivenFactsFor(1, new Vec3(3, 1, 3));

        var result = await _writer.ApplyAsync(
            1, null, document => Result.Success(document with { Stage = SceneStages.Dressed }));

        Assert.True(result.IsSuccess);
        Assert.Equal("Containment.BelowFloor", Assert.Single(result.Value.Carried).Code);
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

    /// <summary>
    /// The projection rides the write it describes (prompt 13-C). Rebuilt here rather than in
    /// each handler because SceneWriter is the one point every document write funnels through
    /// - update_scene_document and the editor's whole-document PUT both replace the document
    /// outright, and a projection maintained anywhere else drifts on the path nobody tested.
    /// </summary>
    [Fact]
    public async Task AnAcceptedWrite_RebuildsWhatTheSceneReferences()
    {
        GivenScene();
        IReadOnlyList<SceneAssetUsage>? written = null;
        _usage.Setup(u => u.ReplaceForSceneAsync(1, It.IsAny<IReadOnlyList<SceneAssetUsage>>(), It.IsAny<CancellationToken>()))
            .Callback<int, IReadOnlyList<SceneAssetUsage>, CancellationToken>((_, rows, _) => written = rows)
            .Returns(Task.CompletedTask);

        var result = await _writer.ApplyAsync(1, null, document => Result.Success(
            document with { Nodes = new[] { ModelNode("sofa", 41), ModelNode("lamp", 42) } }));

        Assert.True(result.IsSuccess);
        Assert.Equal(new[] { "sofa", "lamp" }, written!.Select(r => r.NodeId).ToArray());
        Assert.Equal(new[] { 41, 42 }, written.Select(r => r.AssetId).ToArray());
    }

    [Fact]
    public async Task ARejectedWrite_LeavesTheProjectionAlone()
    {
        GivenScene();

        var result = await _writer.ApplyAsync(1, null, document => Result.Success(
            document with { Nodes = new[] { ModelNode("sofa"), ModelNode("sofa") } }));

        // Whatever a mutation produced is a candidate, and a candidate that does not validate
        // must not reach the index any more than it reaches the document.
        Assert.True(result.IsFailure);
        _usage.Verify(
            u => u.ReplaceForSceneAsync(It.IsAny<int>(), It.IsAny<IReadOnlyList<SceneAssetUsage>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
