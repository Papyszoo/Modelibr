using Application.Abstractions.Messaging;
using Application.Agents;
using Application.EnvironmentMaps;
using Application.Models;
using Application.Packs;
using Application.Scenes;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.Models;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Agents;

/// <summary>
/// Undo for agent writes. What is being verified here is that a reversal only ever claims
/// to have happened when its inverse actually ran, and that a batch comes apart in the
/// opposite order it was built - the two ways an undo can quietly corrupt a library.
/// </summary>
public class AgentOperationReverserTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IAgentAudit> _audit = new();
    private readonly Mock<ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse>> _updateTags = new();
    private readonly Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>> _setCategory = new();
    private readonly Mock<ICommandHandler<RemoveModelFromPackCommand>> _removeFromPack = new();
    private readonly Mock<ICommandHandler<DeletePackCommand>> _deletePack = new();
    private readonly Mock<ICommandHandler<RemoveTextureFromPackCommand>> _removeTexture = new();
    private readonly Mock<ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse>> _addTexture = new();
    private readonly Mock<ICommandHandler<RestoreModelTextureBindingCommand>> _restoreTextureBinding = new();
    private readonly Mock<ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse>> _deleteModel = new();
    private readonly Mock<ICommandHandler<SoftDeleteSoundCommand>> _deleteSound = new();
    private readonly Mock<ICommandHandler<SoftDeleteSpriteCommand>> _deleteSprite = new();
    private readonly Mock<ICommandHandler<SoftDeleteEnvironmentMapCommand>> _deleteEnvironmentMap = new();
    private readonly Mock<ICommandHandler<SoftDeleteTextureSetCommand, SoftDeleteTextureSetResponse>> _deleteTextureSet = new();
    private readonly Mock<ICommandHandler<RemoveSceneNodeCommand, SceneNodeRemovalResponse>> _removeSceneNode = new();
    private readonly Mock<ICommandHandler<RestoreSceneNodeCommand, SceneSummary>> _restoreSceneNode = new();
    private readonly Mock<ICommandHandler<MoveSceneNodeCommand, SceneNodeMoveResponse>> _moveSceneNode = new();
    private readonly Mock<ICommandHandler<SetSceneLightCommand, SceneLightResponse>> _setSceneLight = new();
    private readonly Mock<ICommandHandler<ApplySceneMaterialCommand, SceneMaterialResponse>> _applySceneMaterial = new();
    private readonly Mock<ICommandHandler<UpdateSceneDocumentCommand, SceneView>> _updateSceneDocument = new();
    private readonly Mock<ICommandHandler<DeleteSceneCommand>> _deleteScene = new();

    private readonly AgentOperationReverser _reverser;

    public AgentOperationReverserTests()
    {
        _reverser = new AgentOperationReverser(
            _audit.Object, _updateTags.Object, _setCategory.Object, _removeFromPack.Object, _deletePack.Object,
            _removeTexture.Object, _addTexture.Object, _restoreTextureBinding.Object,
            _deleteModel.Object, _deleteSound.Object,
            _deleteSprite.Object, _deleteEnvironmentMap.Object, _deleteTextureSet.Object,
            _removeSceneNode.Object, _restoreSceneNode.Object, _moveSceneNode.Object, _setSceneLight.Object,
            _applySceneMaterial.Object, _updateSceneDocument.Object, _deleteScene.Object);

        _audit.Setup(a => a.TryMarkReversedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
    }

    private static AgentOperationLog Completed(
        string key, string operation, string? assetType, int? assetId,
        string? before = null, string? after = null, string? batchId = null)
    {
        var entry = AgentOperationLog.Create(
            key, operation, Now, batchId: batchId, assetType: assetType, assetId: assetId, payloadBefore: before);
        entry.MarkCompleted(Now, assetType, assetId, after);
        return entry;
    }

    private void Records(params AgentOperationLog[] entries)
    {
        foreach (var entry in entries)
        {
            _audit.Setup(a => a.FindAsync(entry.IdempotencyKey, It.IsAny<CancellationToken>()))
                .ReturnsAsync(entry);
        }
    }

    [Fact]
    public async Task PlanAsync_Requires_Exactly_One_Of_Key_Or_Batch()
    {
        var neither = await _reverser.PlanAsync(null, null);
        var both = await _reverser.PlanAsync("key-1", "batch-1");

        Assert.Equal("AmbiguousTarget", neither.Error.Code);
        Assert.Equal("AmbiguousTarget", both.Error.Code);
    }

    [Fact]
    public async Task SetTags_Is_Reversed_By_Restoring_The_Recorded_Tags()
    {
        var entry = Completed(
            "key-1", "set-tags", "Model", 7,
            before: "{\"tags\":[\"wood\",\"crate\"],\"description\":\"a crate\",\"categoryId\":3}");
        Records(entry);
        UpdateModelTagsCommand? applied = null;
        _updateTags.Setup(h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()))
            .Callback<UpdateModelTagsCommand, CancellationToken>((c, _) => applied = c)
            .ReturnsAsync(Result.Success(new UpdateModelTagsResponse(7, ["wood", "crate"], "a crate", 3)));

        var plan = await _reverser.PlanAsync("key-1", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        Assert.NotNull(applied);
        Assert.Equal(["wood", "crate"], applied!.Tags);
        Assert.Equal("a crate", applied.Description);
        Assert.Equal(3, applied.CategoryId);
    }

    [Fact]
    public async Task A_Write_Whose_Prior_State_Was_Never_Recorded_Is_Reported_Unreversible_Not_Reversed()
    {
        // The failure this guards against is the worst kind an undo can have: reporting
        // success while leaving the library exactly as the bad write left it.
        var entry = Completed("key-2", "set-tags", "Model", 7, before: null);
        Records(entry);

        var plan = await _reverser.PlanAsync("key-2", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(plan.Value.Steps.Single().IsSupported);
        Assert.False(result.Value.Single().Reversed);
        _updateTags.Verify(
            h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        _audit.Verify(a => a.TryMarkReversedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Membership_That_Predates_The_Write_Is_Left_Alone()
    {
        // add_to_pack on a model already in the pack added nothing, so its inverse must
        // remove nothing - otherwise undo deletes a curation decision the agent never made.
        var entry = Completed(
            "key-3", "add-to-pack", "Model", 7,
            before: "{\"packId\":2,\"wasMember\":true}",
            after: "{\"packId\":2,\"modelId\":7}");
        Records(entry);

        var plan = await _reverser.PlanAsync("key-3", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        _removeFromPack.Verify(
            h => h.Handle(It.IsAny<RemoveModelFromPackCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Batch_Is_Reversed_Newest_First()
    {
        // Built pack-then-members; undoing in recording order would try to delete a pack
        // that still holds models.
        var create = Completed("key-a", "create-pack", "Pack", 5, batchId: "batch-1");
        var add = Completed(
            "key-b", "add-to-pack", "Model", 7,
            before: "{\"packId\":5,\"wasMember\":false}", after: "{\"packId\":5,\"modelId\":7}", batchId: "batch-1");
        Records(create, add);
        _audit.Setup(a => a.FindBatchAsync("batch-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AgentOperationLog> { create, add });

        var order = new List<string>();
        _removeFromPack.Setup(h => h.Handle(It.IsAny<RemoveModelFromPackCommand>(), It.IsAny<CancellationToken>()))
            .Callback(() => order.Add("remove-member"))
            .ReturnsAsync(Result.Success());
        _deletePack.Setup(h => h.Handle(It.IsAny<DeletePackCommand>(), It.IsAny<CancellationToken>()))
            .Callback(() => order.Add("delete-pack"))
            .ReturnsAsync(Result.Success());

        var plan = await _reverser.PlanAsync(null, "batch-1");
        await _reverser.ApplyAsync(plan.Value);

        Assert.Equal(["remove-member", "delete-pack"], order);
    }

    [Fact]
    public async Task Reversing_An_Import_Recycles_The_Asset_And_Counts_As_Destructive()
    {
        var entry = Completed("key-4", "import-sound", "Sound", 12);
        Records(entry);
        _deleteSound.Setup(h => h.Handle(It.IsAny<SoftDeleteSoundCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());

        var plan = await _reverser.PlanAsync("key-4", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(plan.Value.IsDestructive);
        Assert.True(result.Value.Single().Reversed);
        _deleteSound.Verify(
            h => h.Handle(It.Is<SoftDeleteSoundCommand>(c => c.Id == 12), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task An_Already_Reversed_Entry_Is_Not_Reversed_Twice()
    {
        var entry = Completed("key-5", "import-model", "Model", 3);
        entry.MarkReversed(Now);
        Records(entry);

        var plan = await _reverser.PlanAsync("key-5", null);

        Assert.True(plan.Value.IsEmpty);
        _deleteModel.Verify(
            h => h.Handle(It.IsAny<SoftDeleteModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Failed_Step_Stops_The_Batch_Rather_Than_Pressing_On()
    {
        // The remaining steps were planned against a state the failure means we are no
        // longer in, so continuing would apply inverses to something unexpected.
        var first = Completed("key-c", "import-sprite", "Sprite", 4, batchId: "batch-2");
        var second = Completed("key-d", "import-sound", "Sound", 5, batchId: "batch-2");
        Records(first, second);
        _audit.Setup(a => a.FindBatchAsync("batch-2", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AgentOperationLog> { first, second });
        _deleteSound.Setup(h => h.Handle(It.IsAny<SoftDeleteSoundCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure(new Error("SoundNotFound", "gone")));

        var plan = await _reverser.PlanAsync(null, "batch-2");
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.Single(result.Value);
        Assert.False(result.Value[0].Reversed);
        _deleteSprite.Verify(
            h => h.Handle(It.IsAny<SoftDeleteSpriteCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Rederivation_Is_Reported_As_Having_No_Inverse()
    {
        var entry = Completed("key-6", "trigger-rederive", "Model", 8);
        Records(entry);

        var plan = await _reverser.PlanAsync("key-6", null);

        var step = plan.Value.Steps.Single();
        Assert.False(step.IsSupported);
        Assert.Contains("no prior state", step.Blocker);
    }

    [Fact]
    public async Task An_Import_That_Matched_An_Existing_Asset_Is_Not_Undone_By_Recycling_It()
    {
        // Import is content-addressed, so re-importing bytes already in the library returns
        // the model that was there and creates nothing. Undoing that entry as an ordinary
        // import would recycle a model the agent never imported - the user's original.
        var entry = Completed(
            "key-dedup", "import-model", "Model", 7,
            after: "{\"modelId\":7,\"alreadyExisted\":true}");
        Records(entry);

        var plan = await _reverser.PlanAsync("key-dedup", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(plan.Value.Steps.Single().IsSupported);
        Assert.False(plan.Value.IsDestructive);
        Assert.False(result.Value.Single().Reversed);
        _deleteModel.Verify(
            h => h.Handle(It.IsAny<SoftDeleteModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task An_Import_That_Created_The_Asset_Is_Still_Undone_By_Recycling_It()
    {
        var entry = Completed(
            "key-fresh", "import-model", "Model", 7,
            after: "{\"modelId\":7,\"alreadyExisted\":false}");
        Records(entry);
        _deleteModel.Setup(h => h.Handle(It.IsAny<SoftDeleteModelCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SoftDeleteModelResponse(true, "recycled")));

        var plan = await _reverser.PlanAsync("key-fresh", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        _deleteModel.Verify(
            h => h.Handle(It.IsAny<SoftDeleteModelCommand>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Adding_A_Channel_Over_An_Existing_One_Is_Reversed_By_Putting_The_Old_One_Back()
    {
        // The whole point: removing only the texture the write added would leave the set
        // permanently short the map it displaced, while reporting the undo as successful.
        var entry = Completed(
            "key-chan", "add-texture-channel", "TextureSet", 12,
            before: "{\"textureSetId\":12,\"replacedTexture\":{\"TextureId\":80,\"FileId\":55,\"TextureType\":\"Normal\",\"SourceChannel\":\"RGB\"}}",
            after: "{\"textureId\":81}");
        Records(entry);
        AddTextureToTextureSetCommand? applied = null;
        _addTexture.Setup(h => h.Handle(It.IsAny<AddTextureToTextureSetCommand>(), It.IsAny<CancellationToken>()))
            .Callback<AddTextureToTextureSetCommand, CancellationToken>((c, _) => applied = c)
            .ReturnsAsync(Result.Success(new AddTextureToTextureSetResponse(
                82, Domain.ValueObjects.TextureType.Normal, Domain.ValueObjects.TextureChannel.RGB, 12)));

        var plan = await _reverser.PlanAsync("key-chan", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        Assert.NotNull(applied);
        Assert.Equal(12, applied!.TextureSetId);
        Assert.Equal(55, applied.FileId);
        Assert.Equal(Domain.ValueObjects.TextureType.Normal, applied.TextureType);
        // Re-adding evicts the new texture itself, so no separate removal is issued.
        _removeTexture.Verify(
            h => h.Handle(It.IsAny<RemoveTextureFromPackCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Adding_A_Channel_Into_An_Empty_Slot_Is_Reversed_By_Removing_It()
    {
        var entry = Completed(
            "key-chan-2", "add-texture-channel", "TextureSet", 12,
            before: "{\"textureSetId\":12,\"replacedTexture\":null}",
            after: "{\"textureId\":81}");
        Records(entry);
        _removeTexture.Setup(h => h.Handle(It.IsAny<RemoveTextureFromPackCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());

        var plan = await _reverser.PlanAsync("key-chan-2", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        _removeTexture.Verify(
            h => h.Handle(It.IsAny<RemoveTextureFromPackCommand>(), It.IsAny<CancellationToken>()), Times.Once);
        _addTexture.Verify(
            h => h.Handle(It.IsAny<AddTextureToTextureSetCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Binding_A_Texture_Set_Is_Reversed_Across_Every_Version_It_Touched()
    {
        // Binding maps the set into EVERY version and fills in each one's default where it
        // was null. Restoring only the active version's default left the rest bound to the
        // set the agent chose, while the undo reported success.
        var entry = Completed(
            "key-bind", "bind-texture-set", "Model", 42,
            before: "{\"binding\":{\"ModelId\":42,\"MaterialName\":\"\",\"Versions\":[" +
                    "{\"ModelVersionId\":1,\"DefaultTextureSetId\":9,\"Mappings\":[{\"TextureSetId\":9,\"MaterialName\":\"\",\"VariantName\":\"\"}]}," +
                    "{\"ModelVersionId\":2,\"DefaultTextureSetId\":null,\"Mappings\":[]}]}}");
        Records(entry);
        RestoreModelTextureBindingCommand? applied = null;
        _restoreTextureBinding.Setup(h => h.Handle(It.IsAny<RestoreModelTextureBindingCommand>(), It.IsAny<CancellationToken>()))
            .Callback<RestoreModelTextureBindingCommand, CancellationToken>((c, _) => applied = c)
            .ReturnsAsync(Result.Success());

        var plan = await _reverser.PlanAsync("key-bind", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        Assert.NotNull(applied);
        Assert.Equal(2, applied!.Snapshot.Versions.Count);
        Assert.Equal(9, applied.Snapshot.Versions[0].DefaultTextureSetId);
        Assert.Null(applied.Snapshot.Versions[1].DefaultTextureSetId);
    }

    [Fact]
    public async Task A_Bind_Recorded_Before_The_Snapshot_Existed_Is_Reported_Unreversible()
    {
        // Entries written by the older tool recorded only previousDefaultTextureSetId. There
        // is no honest way to restore the other versions from that, so it must not claim to.
        var entry = Completed(
            "key-bind-old", "bind-texture-set", "Model", 42,
            before: "{\"modelId\":42,\"textureSetId\":9,\"previousDefaultTextureSetId\":3}");
        Records(entry);

        var plan = await _reverser.PlanAsync("key-bind-old", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(plan.Value.Steps.Single().IsSupported);
        Assert.False(result.Value.Single().Reversed);
        _restoreTextureBinding.Verify(
            h => h.Handle(It.IsAny<RestoreModelTextureBindingCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Distributing_A_Row_Is_Reversed_By_Removing_Every_Node_It_Placed()
    {
        var entry = Completed(
            "key-row", "distribute-assets", "Scene", 3,
            before: "{\"removedNodeIds\":[\"lamp-1\",\"lamp-2\",\"lamp-3\"]}");
        Records(entry);
        var removed = new List<string>();
        _removeSceneNode.Setup(h => h.Handle(It.IsAny<RemoveSceneNodeCommand>(), It.IsAny<CancellationToken>()))
            .Callback<RemoveSceneNodeCommand, CancellationToken>((c, _) => removed.Add(c.NodeId))
            .ReturnsAsync(Result.Success(new SceneNodeRemovalResponse(null!, null!)));

        var plan = await _reverser.PlanAsync("key-row", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        Assert.Equal(["lamp-1", "lamp-2", "lamp-3"], removed);
    }

    [Fact]
    public async Task Restoring_A_Light_Reproduces_It_Exactly_Rather_Than_Merging_Into_What_Is_There()
    {
        // A light that had no target or name is only restorable when null means null. Merge
        // semantics would keep whatever the write aimed it at and still report success.
        var entry = Completed(
            "key-light", "set-light", "Scene", 3,
            before: "{\"lightId\":\"key\",\"light\":{\"Id\":\"key\",\"Type\":\"point\",\"Position\":{\"X\":1,\"Y\":2,\"Z\":3},\"Intensity\":1.0,\"Color\":\"#ffffff\",\"Target\":null,\"Name\":null}}");
        Records(entry);
        SetSceneLightCommand? applied = null;
        _setSceneLight.Setup(h => h.Handle(It.IsAny<SetSceneLightCommand>(), It.IsAny<CancellationToken>()))
            .Callback<SetSceneLightCommand, CancellationToken>((c, _) => applied = c)
            .ReturnsAsync(Result.Success(new SceneLightResponse(null!, null, null)));

        var plan = await _reverser.PlanAsync("key-light", null);
        await _reverser.ApplyAsync(plan.Value);

        Assert.NotNull(applied);
        Assert.True(applied!.Exact);
        Assert.Null(applied.Target);
        Assert.Null(applied.Name);
    }
}
