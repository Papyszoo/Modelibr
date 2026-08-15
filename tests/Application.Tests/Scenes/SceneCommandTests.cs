using Application.Abstractions.Repositories;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The scene edits an agent actually makes, driven through the real
/// <see cref="SceneWriter"/> over a mocked repository - the handlers are thin, and what is
/// worth asserting is the behaviour they compose: grounding, overlap reporting, and the
/// "before" state each write records so it can be undone.
/// </summary>
public class SceneCommandTests
{
    private static readonly DateTime Now = new(2026, 8, 16, 12, 0, 0, DateTimeKind.Utc);

    private const int SceneId = 1;
    private const int ModelId = 42;
    private const int VersionId = 7;

    private readonly Mock<ISceneRepository> _scenes = new();
    private readonly Mock<ISceneAssetFacts> _facts = new();
    private readonly SceneWriter _writer;
    private Scene _scene = null!;

    public SceneCommandTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        _writer = new SceneWriter(_scenes.Object, _facts.Object, clock.Object);

        GivenFacts(new Vec3(2, 4, 2), "centered");
        GivenScene(SceneDocument.Empty());
    }

    /// <summary>The asset is 2×4×2 m with a centered origin unless a test says otherwise.</summary>
    private void GivenFacts(Vec3? dimensions, string? origin, double? gridSize = null)
    {
        var reference = new SceneAssetRef(SceneAssetTypes.Model, ModelId, VersionId);
        var resolved = new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);

        if (dimensions is not null || origin is not null || gridSize is not null)
        {
            resolved[SceneSpatial.FactsKey(reference)] =
                new(SceneAssetTypes.Model, ModelId, VersionId, dimensions, origin, gridSize);
        }

        _facts.Setup(f => f.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(resolved);
    }

    private void GivenScene(SceneDocument document)
    {
        _scene = Scene.Create(
            "Street", SceneDocumentCodec.Serialize(document), SceneDocument.CurrentSchemaVersion, Now).Value;
        typeof(Scene).GetProperty(nameof(Scene.Id))!.SetValue(_scene, SceneId);
        _scenes.Setup(s => s.GetByIdAsync(SceneId, It.IsAny<CancellationToken>())).ReturnsAsync(_scene);
    }

    private PlaceSceneAssetCommandHandler Place => new(_writer, _facts.Object);

    private static PlaceSceneAssetCommand PlaceCommand(
        string? nodeId = null, Vec3? position = null, bool groundSnap = false, double? snapToGrid = null) =>
        new(SceneId, SceneAssetTypes.Model, ModelId, VersionId, nodeId,
            Position: position, GroundSnap: groundSnap, SnapToGrid: snapToGrid);

    [Fact]
    public async Task PlaceAsset_When_No_NodeId_Is_Given_Generates_A_Readable_One()
    {
        var result = await Place.Handle(PlaceCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("model-42-1", result.Value.Node.NodeId);
    }

    [Fact]
    public async Task PlaceAsset_Twice_Generates_Distinct_Node_Ids()
    {
        await Place.Handle(PlaceCommand(), CancellationToken.None);
        var second = await Place.Handle(PlaceCommand(), CancellationToken.None);

        Assert.Equal("model-42-2", second.Value.Node.NodeId);
    }

    [Fact]
    public async Task PlaceAsset_When_GroundSnap_Is_Set_Rests_A_Centered_Asset_On_The_Ground()
    {
        // The whole point of the flag: an asset with a centered origin placed at y=0 is
        // buried to its middle, and an agent has no way to see that.
        var result = await Place.Handle(PlaceCommand(groundSnap: true), CancellationToken.None);

        Assert.Equal(2, result.Value.Node.Transform.Position.Y, 6);
        Assert.Equal(0, result.Value.Node.Footprint!.Value.Min.Y, 6);
    }

    [Fact]
    public async Task PlaceAsset_When_Bounds_Are_Unknown_Leaves_The_Position_Alone()
    {
        GivenFacts(dimensions: null, origin: null);

        var result = await Place.Handle(PlaceCommand(groundSnap: true), CancellationToken.None);

        Assert.Equal(0, result.Value.Node.Transform.Position.Y, 6);
        Assert.Null(result.Value.Node.Footprint);
    }

    [Fact]
    public async Task PlaceAsset_When_SnapToGrid_Is_Zero_Uses_The_Assets_Own_Derived_Grid()
    {
        GivenFacts(new Vec3(2, 4, 2), "centered", gridSize: 4);

        var result = await Place.Handle(
            PlaceCommand(position: new Vec3(3.2, 0, -5.1), snapToGrid: 0), CancellationToken.None);

        Assert.Equal(4, result.Value.Node.Transform.Position.X, 6);
        Assert.Equal(-4, result.Value.Node.Transform.Position.Z, 6);
    }

    [Fact]
    public async Task PlaceAsset_Reports_The_Node_It_Now_Overlaps()
    {
        await Place.Handle(PlaceCommand(nodeId: "first"), CancellationToken.None);

        var result = await Place.Handle(
            PlaceCommand(nodeId: "second", position: new Vec3(1, 0, 0)), CancellationToken.None);

        var overlap = Assert.Single(result.Value.Overlaps);
        Assert.Contains("second", new[] { overlap.NodeIdA, overlap.NodeIdB });
    }

    [Fact]
    public async Task PlaceAsset_Only_Reports_Overlaps_Involving_The_Node_It_Placed()
    {
        // Two nodes that already overlapped stay the agent's problem to find with get_scene;
        // re-reporting them on every write buries the one this call just caused.
        await Place.Handle(PlaceCommand(nodeId: "a"), CancellationToken.None);
        await Place.Handle(PlaceCommand(nodeId: "b"), CancellationToken.None);

        var result = await Place.Handle(
            PlaceCommand(nodeId: "far", position: new Vec3(100, 0, 0)), CancellationToken.None);

        Assert.Empty(result.Value.Overlaps);
    }

    [Fact]
    public async Task PlaceAsset_When_The_NodeId_Is_Taken_Fails()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);

        var result = await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.DuplicateNodeId", result.Error.Code);
    }

    [Fact]
    public async Task MoveNode_Returns_The_Transform_It_Replaced()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp", position: new Vec3(1, 2, 3)), CancellationToken.None);

        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "lamp", Position: new Vec3(9, 9, 9)), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new Vec3(1, 2, 3), result.Value.PreviousTransform.Position);
        Assert.Equal(new Vec3(9, 9, 9), result.Value.Node.Transform.Position);
    }

    [Fact]
    public async Task MoveNode_Leaves_Omitted_Components_Alone()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp", position: new Vec3(1, 2, 3)), CancellationToken.None);

        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "lamp", Scale: new Vec3(2, 2, 2)), CancellationToken.None);

        Assert.Equal(new Vec3(1, 2, 3), result.Value.Node.Transform.Position);
        Assert.Equal(new Vec3(2, 2, 2), result.Value.Node.Transform.Scale);
    }

    [Fact]
    public async Task MoveNode_When_The_Node_Does_Not_Exist_Returns_NodeNotFound()
    {
        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "ghost", Position: Vec3.One), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.NodeNotFound", result.Error.Code);
    }

    [Fact]
    public async Task RemoveNode_Returns_The_Whole_Node_So_It_Can_Be_Restored()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp", position: new Vec3(1, 2, 3)), CancellationToken.None);

        var removed = await new RemoveSceneNodeCommandHandler(_writer).Handle(
            new RemoveSceneNodeCommand(SceneId, "lamp"), CancellationToken.None);

        Assert.True(removed.IsSuccess);
        Assert.Equal("lamp", removed.Value.RemovedNode.Id);
        Assert.Equal(new Vec3(1, 2, 3), removed.Value.RemovedNode.Transform.Position);
        Assert.Equal(0, removed.Value.Scene.NodeCount);

        var restored = await new RestoreSceneNodeCommandHandler(_writer).Handle(
            new RestoreSceneNodeCommand(SceneId, removed.Value.RemovedNode), CancellationToken.None);

        Assert.Equal(1, restored.Value.NodeCount);
    }

    [Fact]
    public async Task RestoreNode_Twice_Does_Not_Duplicate_It()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);
        var removed = await new RemoveSceneNodeCommandHandler(_writer).Handle(
            new RemoveSceneNodeCommand(SceneId, "lamp"), CancellationToken.None);

        var handler = new RestoreSceneNodeCommandHandler(_writer);
        await handler.Handle(new RestoreSceneNodeCommand(SceneId, removed.Value.RemovedNode), CancellationToken.None);
        var second = await handler.Handle(new RestoreSceneNodeCommand(SceneId, removed.Value.RemovedNode), CancellationToken.None);

        Assert.Equal(1, second.Value.NodeCount);
    }

    [Fact]
    public async Task SetLight_Upserts_By_Id_Rather_Than_Stacking()
    {
        var handler = new SetSceneLightCommandHandler(_writer);

        await handler.Handle(
            new SetSceneLightCommand(SceneId, "key", SceneLightTypes.Directional, new Vec3(5, 10, 5), 1.0), CancellationToken.None);
        var second = await handler.Handle(
            new SetSceneLightCommand(SceneId, "key", Intensity: 2.5), CancellationToken.None);

        Assert.Equal(1, second.Value.Scene.LightCount);
        Assert.Equal(2.5, second.Value.Light!.Intensity);
        // The type survives an update that did not mention it - "make it brighter" must not
        // turn a directional light into something else.
        Assert.Equal(SceneLightTypes.Directional, second.Value.Light.Type);
        Assert.Equal(1.0, second.Value.PreviousLight!.Intensity);
    }

    [Fact]
    public async Task SetLight_When_Creating_Without_A_Type_Fails()
    {
        var result = await new SetSceneLightCommandHandler(_writer).Handle(
            new SetSceneLightCommand(SceneId, "key", Intensity: 2), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.LightTypeRequired", result.Error.Code);
    }

    [Fact]
    public async Task SetLight_Can_Remove_And_Reports_What_It_Removed()
    {
        var handler = new SetSceneLightCommandHandler(_writer);
        await handler.Handle(
            new SetSceneLightCommand(SceneId, "key", SceneLightTypes.Point, Vec3.Zero), CancellationToken.None);

        var removed = await handler.Handle(new SetSceneLightCommand(SceneId, "key", Remove: true), CancellationToken.None);

        Assert.Equal(0, removed.Value.Scene.LightCount);
        Assert.Null(removed.Value.Light);
        Assert.Equal(SceneLightTypes.Point, removed.Value.PreviousLight!.Type);
    }

    [Fact]
    public async Task ApplyMaterial_Records_The_Binding_It_Replaced()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);
        var handler = new ApplySceneMaterialCommandHandler(_writer);

        await handler.Handle(new ApplySceneMaterialCommand(SceneId, "lamp", TextureSetId: 3), CancellationToken.None);
        var second = await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "lamp", TextureSetId: 9), CancellationToken.None);

        Assert.Equal(9, second.Value.Node.Material!.TextureSetId);
        Assert.Equal(3, second.Value.PreviousMaterial!.TextureSetId);
    }

    [Fact]
    public async Task ApplyMaterial_With_Nothing_To_Apply_Is_Rejected_As_Ambiguous()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);

        var result = await new ApplySceneMaterialCommandHandler(_writer).Handle(
            new ApplySceneMaterialCommand(SceneId, "lamp"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.MaterialEmpty", result.Error.Code);
    }

    [Fact]
    public async Task UpdateSceneDocument_Rejects_An_Invalid_Document_Without_Touching_The_Scene()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);
        var before = _scene.DocumentJson;

        var result = await new UpdateSceneDocumentCommandHandler(_writer).Handle(
            new UpdateSceneDocumentCommand(SceneId, """{"schemaVersion":1,"nodes":[],"lights":[],"bogus":true}"""),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal(before, _scene.DocumentJson);
    }
}
