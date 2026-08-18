using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Domain.Services;
using Domain.ValueObjects;
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

    // Profiles decide the identity and appearance findings that ride along with a write.
    // These tests are about placement, so the default is "nothing profiled", which is also
    // what a library with nothing extracted yet looks like.
    private readonly Mock<ISceneAssetProfiles> _profiles = new();
    private readonly Mock<ISceneDocumentCommit> _commit = new();

    // apply_material resolves what it was asked to bind before it writes. These tests are
    // about the binding behaviour, so the default library says "yes, that exists" and
    // records no slots at all - the state an asset extracted before slots were captured is
    // in, and the one case slot validation deliberately waves through.
    private readonly Mock<IMaterialRepository> _materials = new();
    private readonly Mock<ITextureSetRepository> _textureSets = new();
    private readonly Mock<IAssetPartRepository> _parts = new();

    private readonly SceneWriter _writer;
    private Scene _scene = null!;

    public SceneCommandTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        _facts.Setup(f => f.FindUnresolvableAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SceneAssetReferenceProblem>());
        _commit.Setup(c => c.SaveAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Result.Success());
        _profiles.Setup(p => p.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal));

        _materials.Setup(m => m.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((int _, CancellationToken _) =>
                Material.Create("brass", MaterialParameters.Default, Now));
        _textureSets.Setup(t => t.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((int _, CancellationToken _) => TextureSet.Create("oak", Now));
        _parts.Setup(p => p.GetForAssetAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AssetPart>());

        _writer = new SceneWriter(_scenes.Object, _facts.Object, _commit.Object, clock.Object);

        GivenFacts(new Vec3(2, 4, 2), "centered");
        GivenScene(SceneDocument.Empty());
    }

    private ApplySceneMaterialCommandHandler Dress => new(
        _writer, _materials.Object, _textureSets.Object, _parts.Object, _scenes.Object);

    /// <summary>Gives the placed model a set of authored material slots.</summary>
    private void GivenMaterialSlots(params string[] slots)
    {
        var part = AssetPart.Create(
            SceneAssetTypes.Model, ModelId, VersionId, "root/mesh", "mesh", 0, "mesh", Now,
            detail: $$"""{"materialSlots":[{{string.Join(",", slots.Select(s => $"\"{s}\""))}}]}""");

        _parts.Setup(p => p.GetForAssetAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { part });
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

    private PlaceSceneAssetCommandHandler Place => new(_writer, _facts.Object, _profiles.Object);

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

        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "lamp", Position: new Vec3(9, 9, 9)), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new Vec3(1, 2, 3), result.Value.PreviousTransform.Position);
        Assert.Equal(new Vec3(9, 9, 9), result.Value.Node.Transform.Position);
    }

    [Fact]
    public async Task MoveNode_Leaves_Omitted_Components_Alone()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp", position: new Vec3(1, 2, 3)), CancellationToken.None);

        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "lamp", Scale: new Vec3(2, 2, 2)), CancellationToken.None);

        Assert.Equal(new Vec3(1, 2, 3), result.Value.Node.Transform.Position);
        Assert.Equal(new Vec3(2, 2, 2), result.Value.Node.Transform.Scale);
    }

    [Fact]
    public async Task MoveNode_When_The_Node_Does_Not_Exist_Returns_NodeNotFound()
    {
        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object).Handle(
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
        var handler = Dress;

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

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "lamp"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.MaterialEmpty", result.Error.Code);
    }

    [Fact]
    public async Task ApplyMaterial_Can_Bind_A_Parameter_Material_Instead_Of_A_Texture_Set()
    {
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 12), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(12, result.Value.Node.Material!.MaterialId);
        Assert.Null(result.Value.Node.Material.TextureSetId);
    }

    [Fact]
    public async Task ApplyMaterial_With_Both_Sources_Is_Rejected_Rather_Than_Resolved()
    {
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", TextureSetId: 3, MaterialId: 12),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.MaterialAmbiguous", result.Error.Code);
    }

    [Fact]
    public async Task ApplyMaterial_When_The_Material_Does_Not_Exist_Refuses_The_Write()
    {
        // The whole failure this closes: the id saved, the node looked dressed, and the
        // render came back grey with nothing anywhere saying why.
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);
        _materials.Setup(m => m.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material?)null);

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "lamp", MaterialId: 91), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.MaterialNotFound", result.Error.Code);
    }

    [Fact]
    public async Task ApplyMaterial_When_The_TextureSet_Does_Not_Exist_Refuses_The_Write()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);
        _textureSets.Setup(t => t.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet?)null);

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "lamp", TextureSetId: 91), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.TextureSetNotFound", result.Error.Code);
    }

    [Fact]
    public async Task ApplyMaterial_When_The_Slot_Is_Not_One_The_Asset_Declares_Lists_The_Ones_It_Does()
    {
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);
        GivenMaterialSlots("cushions", "frame");

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 7, Slot: "cushion"),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.SlotNotFound", result.Error.Code);
        // Naming the alternatives is the point - a rejection an agent cannot act on costs
        // it the same turn the silent write did.
        Assert.Contains("cushions", result.Error.Message);
        Assert.Contains("frame", result.Error.Message);
    }

    [Fact]
    public async Task ApplyMaterial_When_The_Asset_Records_No_Slots_Accepts_The_Slot_Anyway()
    {
        // Assets extracted before slots were captured have none recorded. Refusing them
        // would block dressing that works, so an absent list is not evidence of a typo.
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 7, Slot: "cushions"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task ApplyMaterial_Matches_A_Declared_Slot_Regardless_Of_Case()
    {
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);
        GivenMaterialSlots("Cushions");

        var result = await Dress.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 7, Slot: "cushions"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task ApplyMaterial_Dresses_One_Slot_Without_Disturbing_The_Rest_Of_The_Node()
    {
        // "The cushions of this sofa", which is the thing a scene could not say at all
        // while the only binding was per-node.
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);
        var handler = Dress;

        await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 4), CancellationToken.None);
        var result = await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 7, Slot: "cushions"),
            CancellationToken.None);

        Assert.Equal(4, result.Value.Node.Material!.MaterialId);
        var slot = Assert.Single(result.Value.Node.MaterialSlots!);
        Assert.Equal("cushions", slot.Slot);
        Assert.Equal(7, slot.MaterialId);
    }

    [Fact]
    public async Task ApplyMaterial_Replaces_A_Slots_Binding_Rather_Than_Adding_A_Second_One()
    {
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);
        var handler = Dress;

        await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 7, Slot: "cushions"), CancellationToken.None);
        var second = await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 9, Slot: "cushions"), CancellationToken.None);

        var slot = Assert.Single(second.Value.Node.MaterialSlots!);
        Assert.Equal(9, slot.MaterialId);
        Assert.Equal(7, second.Value.PreviousMaterial!.MaterialId);
    }

    [Fact]
    public async Task ApplyMaterial_Clearing_A_Slot_Leaves_The_Nodes_Default_Binding_Alone()
    {
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);
        var handler = Dress;

        await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 4), CancellationToken.None);
        await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 7, Slot: "cushions"), CancellationToken.None);

        var cleared = await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", Clear: true, Slot: "cushions"), CancellationToken.None);

        Assert.Equal(4, cleared.Value.Node.Material!.MaterialId);
        Assert.Null(cleared.Value.Node.MaterialSlots);
    }

    [Fact]
    public async Task ApplyMaterial_Naming_A_Material_Drops_The_Texture_Set_It_Replaces()
    {
        // A partial update keeps what it does not mention, but not here: the two ids are
        // alternatives, so keeping the old one would leave a binding that names both and
        // the document validator rejects that.
        await Place.Handle(PlaceCommand(nodeId: "sofa"), CancellationToken.None);
        var handler = Dress;

        await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", TextureSetId: 3), CancellationToken.None);
        var result = await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "sofa", MaterialId: 12), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(12, result.Value.Node.Material!.MaterialId);
        Assert.Null(result.Value.Node.Material.TextureSetId);
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


    [Fact]
    public async Task SetLight_With_Exact_Restores_A_Light_That_Had_No_Target_Or_Name()
    {
        // Partial updates ("make it warmer") are what an agent wants, but they make some prior
        // states unreachable: nulls read as "keep what is there". Undo is the one caller that
        // holds the whole previous light and has to reproduce it, target and name included.
        var handler = new SetSceneLightCommandHandler(_writer);
        await handler.Handle(
            new SetSceneLightCommand(
                SceneId, "key", SceneLightTypes.Spot, new Vec3(5, 10, 5), 1.0, "#ffffff",
                Target: new Vec3(1, 0, 1), Name: "Key light"),
            CancellationToken.None);

        var restored = await handler.Handle(
            new SetSceneLightCommand(
                SceneId, "key", SceneLightTypes.Spot, new Vec3(5, 10, 5), 1.0, "#ffffff", Exact: true),
            CancellationToken.None);

        Assert.True(restored.IsSuccess);
        Assert.Null(restored.Value.Light!.Target);
        Assert.Null(restored.Value.Light.Name);
    }

    [Fact]
    public async Task SetLight_Without_Exact_Still_Leaves_Omitted_Fields_Alone()
    {
        var handler = new SetSceneLightCommandHandler(_writer);
        await handler.Handle(
            new SetSceneLightCommand(
                SceneId, "key", SceneLightTypes.Spot, new Vec3(5, 10, 5), 1.0, "#ffffff",
                Target: new Vec3(1, 0, 1), Name: "Key light"),
            CancellationToken.None);

        var updated = await handler.Handle(
            new SetSceneLightCommand(SceneId, "key", Intensity: 2.5), CancellationToken.None);

        Assert.Equal(new Vec3(1, 0, 1), updated.Value.Light!.Target);
        Assert.Equal("Key light", updated.Value.Light.Name);
    }

    [Fact]
    public async Task ApplyMaterial_With_Exact_Restores_A_Binding_That_Had_No_Variant()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp"), CancellationToken.None);
        var handler = Dress;
        await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "lamp", TextureSetId: 3, Variant: "battle-damaged"),
            CancellationToken.None);

        var restored = await handler.Handle(
            new ApplySceneMaterialCommand(SceneId, "lamp", TextureSetId: 3, Variant: null, Exact: true),
            CancellationToken.None);

        Assert.True(restored.IsSuccess);
        Assert.Equal(3, restored.Value.Node.Material!.TextureSetId);
        Assert.Null(restored.Value.Node.Material.Variant);
    }

    [Fact]
    public async Task MoveNode_Keeps_A_Node_On_The_Ground_When_The_Move_Does_Not_Mention_Grounding()
    {
        // The defect this closes: four nodes dropped to half-buried in one call, because a
        // move that supplied only a position re-centred them on their origin and reported it
        // as nothing more than a changed footprint.
        await Place.Handle(PlaceCommand(nodeId: "lamp", groundSnap: true), CancellationToken.None);

        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "lamp", Position: new Vec3(9, 0, 9)), CancellationToken.None);

        Assert.Equal(2, result.Value.Node.Transform.Position.Y, 6);
        Assert.Equal(0, result.Value.Node.Footprint!.Value.Min.Y, 6);
        Assert.True(result.Value.Node.GroundSnap);
    }

    [Fact]
    public async Task MoveNode_Can_Stop_A_Node_Being_Held_On_The_Ground()
    {
        await Place.Handle(PlaceCommand(nodeId: "lamp", groundSnap: true), CancellationToken.None);

        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "lamp", Position: new Vec3(0, 6, 0), GroundSnap: false),
            CancellationToken.None);

        Assert.Equal(6, result.Value.Node.Transform.Position.Y, 6);
        Assert.False(result.Value.Node.GroundSnap);
    }

    [Fact]
    public async Task PlaceAsset_On_Another_Node_Rests_It_On_That_Nodes_Top_Face()
    {
        await Place.Handle(PlaceCommand(nodeId: "table", groundSnap: true), CancellationToken.None);

        var result = await Place.Handle(
            new PlaceSceneAssetCommand(SceneId, SceneAssetTypes.Model, ModelId, VersionId, "vase", AnchorTo: "table"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        // The table is 4 m tall resting on the floor, so its top face is at y=4 and a centered
        // 4 m asset sitting on it has its own centre at 6.
        Assert.Equal(6, result.Value.Node.Transform.Position.Y, 6);
        Assert.Equal(4, result.Value.Node.Footprint!.Value.Min.Y, 6);
        Assert.Equal("table", result.Value.Node.Anchor!.OnNodeId);
    }

    [Fact]
    public async Task MoveNode_Carries_Everything_Anchored_To_It()
    {
        await Place.Handle(PlaceCommand(nodeId: "table", groundSnap: true), CancellationToken.None);
        await Place.Handle(
            new PlaceSceneAssetCommand(SceneId, SceneAssetTypes.Model, ModelId, VersionId, "vase", AnchorTo: "table"),
            CancellationToken.None);

        var moved = await new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "table", Position: new Vec3(12, 0, -3)), CancellationToken.None);

        Assert.True(moved.IsSuccess);

        var scene = await new GetSceneByIdQueryHandler(_writer).Handle(new GetSceneByIdQuery(SceneId), CancellationToken.None);
        var vase = scene.Value.Nodes.Single(n => n.NodeId == "vase");

        Assert.Equal(12, vase.Transform.Position.X, 6);
        Assert.Equal(-3, vase.Transform.Position.Z, 6);
        Assert.Equal(6, vase.Transform.Position.Y, 6);
    }

    [Fact]
    public async Task MoveNode_Can_Detach_A_Node_From_What_It_Rests_On()
    {
        await Place.Handle(PlaceCommand(nodeId: "table", groundSnap: true), CancellationToken.None);
        await Place.Handle(
            new PlaceSceneAssetCommand(SceneId, SceneAssetTypes.Model, ModelId, VersionId, "vase", AnchorTo: "table"),
            CancellationToken.None);

        var handler = new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object);
        var detached = await handler.Handle(
            new MoveSceneNodeCommand(SceneId, "vase", DetachAnchor: true), CancellationToken.None);

        Assert.Null(detached.Value.Node.Anchor);
        // Detaching leaves it where it is rather than dropping it.
        Assert.Equal(6, detached.Value.Node.Transform.Position.Y, 6);

        await handler.Handle(
            new MoveSceneNodeCommand(SceneId, "table", Position: new Vec3(30, 0, 0)), CancellationToken.None);

        var scene = await new GetSceneByIdQueryHandler(_writer).Handle(new GetSceneByIdQuery(SceneId), CancellationToken.None);
        Assert.Equal(0, scene.Value.Nodes.Single(n => n.NodeId == "vase").Transform.Position.X, 6);
    }

    [Fact]
    public async Task RemoveNode_Refuses_While_Something_Rests_On_It()
    {
        // Cascading would delete furniture nobody asked to delete; detaching silently would
        // leave an undo that cannot put the arrangement back. Both are worse than saying so.
        await Place.Handle(PlaceCommand(nodeId: "table", groundSnap: true), CancellationToken.None);
        await Place.Handle(
            new PlaceSceneAssetCommand(SceneId, SceneAssetTypes.Model, ModelId, VersionId, "vase", AnchorTo: "table"),
            CancellationToken.None);

        var result = await new RemoveSceneNodeCommandHandler(_writer).Handle(
            new RemoveSceneNodeCommand(SceneId, "table"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.NodeHasDependents", result.Error.Code);
        Assert.Contains("vase", result.Error.Message);
    }

    [Fact]
    public async Task PlaceAsset_Facing_A_Point_Turns_The_Node_Towards_It()
    {
        var result = await Place.Handle(
            new PlaceSceneAssetCommand(
                SceneId, SceneAssetTypes.Model, ModelId, VersionId, "sofa",
                Position: new Vec3(0, 0, -5), FaceToward: Vec3.Zero),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        // Standing at z=-5 looking at the origin is looking along +Z, which is the assumed front.
        Assert.Equal(0, result.Value.Node.Transform.RotationEuler.Y, 6);
        Assert.Equal(SceneFrontAxes.Default, result.Value.Node.FrontAxis);
    }

    [Fact]
    public async Task PlaceAsset_Facing_A_Point_Honours_A_Declared_Front_Axis()
    {
        var result = await Place.Handle(
            new PlaceSceneAssetCommand(
                SceneId, SceneAssetTypes.Model, ModelId, VersionId, "sofa",
                Position: new Vec3(0, 0, -5), FaceToward: Vec3.Zero, FrontAxis: SceneFrontAxes.MinusZ),
            CancellationToken.None);

        Assert.Equal(180, result.Value.Node.Transform.RotationEuler.Y, 6);
    }

    [Fact]
    public async Task PlaceAsset_With_A_Front_Axis_That_Is_Not_One_Is_Refused()
    {
        var result = await Place.Handle(
            new PlaceSceneAssetCommand(SceneId, SceneAssetTypes.Model, ModelId, VersionId, FrontAxis: "north"),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.UnknownFrontAxis", result.Error.Code);
    }

    [Fact]
    public async Task MoveNode_With_An_Explicit_Rotation_Stops_The_Node_Tracking_What_It_Faced()
    {
        await Place.Handle(
            new PlaceSceneAssetCommand(
                SceneId, SceneAssetTypes.Model, ModelId, VersionId, "sofa",
                Position: new Vec3(0, 0, -5), FaceToward: Vec3.Zero),
            CancellationToken.None);

        var result = await new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object).Handle(
            new MoveSceneNodeCommand(SceneId, "sofa", RotationEuler: new Vec3(0, 33, 0)), CancellationToken.None);

        Assert.Equal(33, result.Value.Node.Transform.RotationEuler.Y, 6);
        Assert.Null(result.Value.Node.FaceToward);
    }

    [Fact]
    public async Task MoveNode_Records_The_Whole_Placement_It_Replaced_So_Undo_Can_Restore_It()
    {
        await Place.Handle(PlaceCommand(nodeId: "table", groundSnap: true), CancellationToken.None);
        await Place.Handle(
            new PlaceSceneAssetCommand(
                SceneId, SceneAssetTypes.Model, ModelId, VersionId, "vase",
                AnchorTo: "table", FaceToward: new Vec3(10, 0, 0), FrontAxis: SceneFrontAxes.MinusZ),
            CancellationToken.None);

        var handler = new MoveSceneNodeCommandHandler(_writer, _facts.Object, _profiles.Object);
        var detached = await handler.Handle(
            new MoveSceneNodeCommand(SceneId, "vase", Position: Vec3.Zero, DetachAnchor: true), CancellationToken.None);

        Assert.Equal("table", detached.Value.PreviousAnchor!.OnNodeId);
        Assert.Equal(new Vec3(10, 0, 0), detached.Value.PreviousFaceToward);
        Assert.Equal(SceneFrontAxes.MinusZ, detached.Value.PreviousFrontAxis);

        // Putting that state back is what reverse_operation issues.
        var restored = await handler.Handle(
            new MoveSceneNodeCommand(
                SceneId, "vase",
                detached.Value.PreviousTransform.Position,
                detached.Value.PreviousTransform.RotationEuler,
                detached.Value.PreviousTransform.Scale,
                GroundSnap: detached.Value.PreviousGroundSnap,
                FaceToward: detached.Value.PreviousFaceToward,
                FrontAxis: detached.Value.PreviousFrontAxis,
                AnchorTo: detached.Value.PreviousAnchor.OnNodeId,
                AnchorOffset: detached.Value.PreviousAnchor.Offset,
                Exact: true),
            CancellationToken.None);

        Assert.Equal("table", restored.Value.Node.Anchor!.OnNodeId);
        Assert.Equal(4, restored.Value.Node.Footprint!.Value.Min.Y, 6);
    }

    [Fact]
    public async Task DistributeAssets_Spaces_Every_Copy_Between_The_Endpoints_Inclusively()
    {
        var handler = new DistributeSceneAssetsCommandHandler(_writer, _facts.Object, _profiles.Object);

        var result = await handler.Handle(
            new DistributeSceneAssetsCommand(
                SceneId, SceneAssetTypes.Model, ModelId,
                new Vec3(0, 0, 0), new Vec3(10, 0, 0), 3, VersionId, NodeIdPrefix: "lamp"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(["lamp-1", "lamp-2", "lamp-3"], result.Value.Nodes.Select(n => n.NodeId));
        Assert.Equal([0, 5, 10], result.Value.Nodes.Select(n => n.Transform.Position.X));
        // One write, so the row lands together and the revision moves once.
        Assert.Equal(2, _scene.Revision);
    }

    [Fact]
    public async Task DistributeAssets_Rejects_A_Count_Beyond_What_One_Call_May_Place()
    {
        var handler = new DistributeSceneAssetsCommandHandler(_writer, _facts.Object, _profiles.Object);

        var result = await handler.Handle(
            new DistributeSceneAssetsCommand(
                SceneId, SceneAssetTypes.Model, ModelId, Vec3.Zero, new Vec3(10, 0, 0), 5_000, VersionId),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.TooManyCopies", result.Error.Code);
        Assert.Equal(1, _scene.Revision);
    }

    [Fact]
    public async Task CreateScene_Refuses_A_Document_That_Claims_A_Stage_It_Does_Not_Hold()
    {
        // Creating is the one write with no "before" for SceneWriter's gate to compare
        // against, so the gate runs in the create handler too. Without it the whole staged
        // workflow is one call away from optional: hand in a room full of floating furniture
        // that calls itself dressed, and nothing asks.
        var unitOfWork = new Mock<IUnitOfWork>();
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        var handler = new CreateSceneCommandHandler(
            _scenes.Object, _writer, unitOfWork.Object, clock.Object);

        var floating = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[]
            {
                new SceneNode(
                    "sofa",
                    new SceneTransform(new Vec3(0, 9, 0), Vec3.Zero, Vec3.One),
                    Asset: new SceneAssetRef(SceneAssetTypes.Model, ModelId, VersionId)),
            },
            Array.Empty<SceneLight>(),
            Stage: SceneStages.Dressed);

        var result = await handler.Handle(
            new CreateSceneCommand("Levitating Room", DocumentJson: SceneDocumentCodec.Serialize(floating)),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.StageBlocked", result.Error.Code);
        _scenes.Verify(s => s.AddAsync(It.IsAny<Scene>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateScene_Accepts_The_Same_Document_Without_The_Claim()
    {
        var unitOfWork = new Mock<IUnitOfWork>();
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        var handler = new CreateSceneCommandHandler(
            _scenes.Object, _writer, unitOfWork.Object, clock.Object);

        var floating = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[]
            {
                new SceneNode(
                    "sofa",
                    new SceneTransform(new Vec3(0, 9, 0), Vec3.Zero, Vec3.One),
                    Asset: new SceneAssetRef(SceneAssetTypes.Model, ModelId, VersionId)),
            },
            Array.Empty<SceneLight>());

        var result = await handler.Handle(
            new CreateSceneCommand("Work In Progress", DocumentJson: SceneDocumentCodec.Serialize(floating)),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
    }
}
