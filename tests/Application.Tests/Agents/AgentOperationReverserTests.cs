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
    private readonly Mock<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>> _setDefault = new();
    private readonly Mock<ICommandHandler<RemoveTextureFromPackCommand>> _removeTexture = new();
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
            _setDefault.Object, _removeTexture.Object, _deleteModel.Object, _deleteSound.Object,
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
}
