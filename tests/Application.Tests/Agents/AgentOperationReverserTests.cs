using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Agents;
using Application.EnvironmentMaps;
using Application.Metadata;
using Application.Models;
using Application.Packs;
using Application.Scenes;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.Models;
using Domain.Scenes;
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
    private readonly Mock<ICommandHandler<SetSceneStageCommand, SceneStageResponse>> _setSceneStage = new();
    private readonly Mock<ICommandHandler<DeleteSceneCommand>> _deleteScene = new();
    private readonly Mock<ICommandHandler<CreateSceneCommand, SceneView>> _createScene = new();
    private readonly Mock<ICommandHandler<RestoreSceneLightsCommand, SceneSummary>> _restoreSceneLights = new();
    private readonly Mock<ICommandHandler<RestoreSceneSlotCommand, SceneSummary>> _restoreSceneSlot = new();
    private readonly Mock<ICommandHandler<RestoreSceneRecommendationsCommand, SceneRecommendationsResponse>> _restoreSceneRecommendations = new();
    private readonly Mock<ICommandHandler<SetSceneProjectCommand, SetSceneProjectResponse>> _setSceneProject = new();
    private readonly Mock<ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse>> _setAssetMetadata = new();

    private readonly FakeUnitOfWork _unitOfWork = new();

    private readonly AgentOperationReverser _reverser;

    public AgentOperationReverserTests()
    {
        _reverser = new AgentOperationReverser(
            _audit.Object, _unitOfWork, _updateTags.Object, _setCategory.Object, _removeFromPack.Object, _deletePack.Object,
            _removeTexture.Object, _addTexture.Object, _restoreTextureBinding.Object,
            _deleteModel.Object, _deleteSound.Object,
            _deleteSprite.Object, _deleteEnvironmentMap.Object, _deleteTextureSet.Object,
            _removeSceneNode.Object, _restoreSceneNode.Object, _moveSceneNode.Object, _setSceneLight.Object,
            _applySceneMaterial.Object, _updateSceneDocument.Object, _setSceneStage.Object, _deleteScene.Object, _createScene.Object, _restoreSceneLights.Object, _restoreSceneSlot.Object,
            _restoreSceneRecommendations.Object, _setSceneProject.Object, _setAssetMetadata.Object);

        // The default: this caller wins the reversal claim, applies the inverse, and
        // records it afterwards. The claim and the record are two calls now, because they
        // are two different facts - "I am doing this" and "this happened".
        _audit.Setup(a => a.TryBeginReversalAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ReversalClaim(ReversalClaimOutcome.Claimed, "rev-1"));
        _audit.Setup(a => a.CompleteReversalAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
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

    /// <summary>
    /// What delete-scene records: the inverse recreates the scene from this document, so a
    /// payload without one is not reversible at all.
    /// </summary>
    private const string DeletedSceneBefore =
        """{"name":"Kitchen","description":null,"document":"{\"schemaVersion\":1,\"nodes\":[],\"lights\":[]}"}""";

    /// <summary>The scene the inverse creates - a new id, which is the point of the case.</summary>
    private static SceneView RecreatedScene() => new(
        new SceneSummary(99, "Kitchen", null, 1, 1, 0, 0, Now, Now),
        new SceneDocument(1, [], []),
        [],
        [],
        []);

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
        _audit.Verify(a => a.TryBeginReversalAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// The concurrency this closes: reverse_operation carries no idempotency key of its
    /// own, so two calls naming one entry both reach the apply loop. Claiming afterwards
    /// let both apply the inverse and only told the loser it had lost - which for an
    /// inverse that CREATES something (recreating a deleted scene) leaves two of it.
    /// </summary>
    [Fact]
    public async Task A_Concurrent_Undo_That_Loses_The_Claim_Does_Not_Apply_The_Inverse()
    {
        var entry = Completed(
            "key-20", "set-tags", "Model", 7,
            before: "{\"tags\":[\"wood\"],\"description\":null,\"categoryId\":null}");
        Records(entry);
        // The other caller got there first and is still going.
        _audit.Setup(a => a.TryBeginReversalAsync("key-20", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ReversalClaim(ReversalClaimOutcome.InProgress));

        var plan = await _reverser.PlanAsync("key-20", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(result.Value.Single().Reversed);
        Assert.Contains("Another caller is reversing", result.Value.Single().Detail);
        _updateTags.Verify(
            h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Claim_Is_Released_Again_When_Its_Inverse_Could_Not_Be_Applied()
    {
        // Otherwise a failed undo leaves the entry stamped reversed for work that never
        // happened, and nothing can ever undo it.
        var entry = Completed(
            "key-21", "set-tags", "Model", 7,
            before: "{\"tags\":[\"wood\"],\"description\":null,\"categoryId\":null}");
        Records(entry);
        _updateTags.Setup(h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<UpdateModelTagsResponse>(new Error("Nope", "the model is gone")));

        var plan = await _reverser.PlanAsync("key-21", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(result.Value.Single().Reversed);
        _audit.Verify(
            a => a.ReleaseReversalAsync("key-21", "rev-1", It.IsAny<CancellationToken>()), Times.Once);
        // And nothing recorded a reversal that did not happen.
        _audit.Verify(
            a => a.CompleteReversalAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
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

    /// <summary>
    /// The crash-safety property, from the outside: an inverse that throws must never leave
    /// the entry looking freshly undoable.
    ///
    /// <para>
    /// This assertion was inverted once already. Before the claim/marker split,
    /// <c>ReversedAt</c> was stamped first, so a throw permanently recorded a reversal that
    /// never happened - and the fix, releasing the claim on the way out, overshot in the
    /// other direction. An inverse commits and <i>then</i> reports, so a throw arrives with
    /// the write possibly already durable; releasing there hands the next call an inverse it
    /// re-applies. The claim is kept, in the state that reads as interrupted.
    /// </para>
    /// </summary>
    [Fact]
    public async Task An_Inverse_That_Throws_Keeps_Its_Claim_Ambiguous_Rather_Than_Releasing_It()
    {
        var entry = Completed(
            "key-22", "set-tags", "Model", 7,
            before: "{\"tags\":[\"wood\"],\"description\":null,\"categoryId\":null}");
        Records(entry);
        _updateTags.Setup(h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("the database went away"));

        var plan = await _reverser.PlanAsync("key-22", null);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _reverser.ApplyAsync(plan.Value));
        _audit.Verify(
            a => a.InterruptReversalAsync("key-22", "rev-1", It.IsAny<CancellationToken>()), Times.Once);
        _audit.Verify(
            a => a.ReleaseReversalAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _audit.Verify(
            a => a.CompleteReversalAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task An_Inverse_That_Commits_And_Then_Throws_Is_Never_Offered_For_Retry()
    {
        // The concrete shape of "unknown": the command applied and the failure came after it.
        // Nothing downstream can tell this from a command that failed before writing, which
        // is exactly why neither may release the claim.
        var entry = Completed(
            "key-22b", "delete-scene", "Scene", 4, before: DeletedSceneBefore);
        Records(entry);
        var created = 0;
        _createScene.Setup(h => h.Handle(It.IsAny<CreateSceneCommand>(), It.IsAny<CancellationToken>()))
            .Callback(() => created++)
            .ThrowsAsync(new InvalidOperationException("committed, then the response blew up"));

        var plan = await _reverser.PlanAsync("key-22b", null);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _reverser.ApplyAsync(plan.Value));
        Assert.Equal(1, created);
        _audit.Verify(
            a => a.InterruptReversalAsync("key-22b", "rev-1", It.IsAny<CancellationToken>()), Times.Once);
        _audit.Verify(
            a => a.ReleaseReversalAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task A_Completion_Marker_That_Throws_After_The_Inverse_Landed_Interrupts_The_Claim()
    {
        // The inverse is durable and only the record of it is missing. Releasing the claim
        // here would invite a second undo of an undo that already happened.
        var entry = Completed(
            "key-22c", "set-tags", "Model", 7,
            before: "{\"tags\":[\"wood\"],\"description\":null,\"categoryId\":null}");
        Records(entry);
        _updateTags.Setup(h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new UpdateModelTagsResponse(7, ["wood"], null, null)));
        _audit.Setup(a => a.CompleteReversalAsync("key-22c", "rev-1", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("the connection dropped"));

        var plan = await _reverser.PlanAsync("key-22c", null);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _reverser.ApplyAsync(plan.Value));
        _audit.Verify(
            a => a.InterruptReversalAsync("key-22c", "rev-1", It.IsAny<CancellationToken>()), Times.Once);
        _audit.Verify(
            a => a.ReleaseReversalAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task A_Cancelled_Inverse_Keeps_Its_Claim_Ambiguous_And_Records_No_Reversal()
    {
        // Cancelling the caller does not cancel a transaction that already committed, so
        // cancellation is the same "unknown" as a throw and settles the same way.
        var entry = Completed(
            "key-23", "set-tags", "Model", 7,
            before: "{\"tags\":[\"wood\"],\"description\":null,\"categoryId\":null}");
        Records(entry);
        using var cts = new CancellationTokenSource();
        _updateTags.Setup(h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()))
            .Callback(() => cts.Cancel())
            .ThrowsAsync(new OperationCanceledException());

        var plan = await _reverser.PlanAsync("key-23", null);

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => _reverser.ApplyAsync(plan.Value, cts.Token));
        // Settled on CancellationToken.None, so the cancellation cannot also cancel the
        // settle - which would leave the claim held and its state unrecorded.
        _audit.Verify(
            a => a.InterruptReversalAsync("key-23", "rev-1", CancellationToken.None), Times.Once);
        _audit.Verify(
            a => a.ReleaseReversalAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _audit.Verify(
            a => a.CompleteReversalAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task A_Claim_Lost_While_The_Inverse_Ran_Is_Not_Reported_As_A_Reversal()
    {
        // The stale-owner case: this call's lease lapsed mid-inverse and somebody else took
        // the claim. The work happened, but this call is not the one entitled to record it,
        // and saying "reversed" would hide a second inverse that may also have run.
        var entry = Completed(
            "key-24", "set-tags", "Model", 7,
            before: "{\"tags\":[\"wood\"],\"description\":null,\"categoryId\":null}");
        Records(entry);
        _updateTags.Setup(h => h.Handle(It.IsAny<UpdateModelTagsCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new UpdateModelTagsResponse(7, ["wood"], null, null)));
        _audit.Setup(a => a.CompleteReversalAsync("key-24", "rev-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var plan = await _reverser.PlanAsync("key-24", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(result.Value.Single().Reversed);
        Assert.Contains("no longer held the reversal claim", result.Value.Single().Detail);
    }

    [Fact]
    public async Task An_Interrupted_Reversal_Is_Reported_Rather_Than_Retaken()
    {
        // A reversal whose owner died mid-inverse. Whether the inverse committed is not
        // recorded, so the entry is neither reversed nor free - and re-running an inverse
        // that creates something would leave two of it.
        var entry = Completed(
            "key-25", "delete-scene", "Scene", 4, before: "{\"name\":\"Kitchen\"}");
        Records(entry);
        _audit.Setup(a => a.TryBeginReversalAsync("key-25", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ReversalClaim(ReversalClaimOutcome.Interrupted));

        var plan = await _reverser.PlanAsync("key-25", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(result.Value.Single().Reversed);
        Assert.Contains("stopped before it could record its outcome", result.Value.Single().Detail);
        _createScene.Verify(
            h => h.Handle(It.IsAny<CreateSceneCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Undoing_A_Delete_Scene_Whose_Outcome_Is_Unknown_Never_Creates_A_Second_Scene()
    {
        // The whole finding in one test. The inverse of delete-scene CREATES something, so
        // applying it twice is not a no-op - it is two scenes under two ids, and only one of
        // them is the one anybody was looking for.
        var entry = Completed("key-26", "delete-scene", "Scene", 4, before: DeletedSceneBefore);
        Records(entry);
        var created = 0;
        _createScene.Setup(h => h.Handle(It.IsAny<CreateSceneCommand>(), It.IsAny<CancellationToken>()))
            .Callback(() => created++)
            .ReturnsAsync(Result.Success(RecreatedScene()));
        // The inverse lands and the marker for it does not - the ambiguous case.
        _audit.Setup(a => a.CompleteReversalAsync("key-26", "rev-1", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("the connection dropped"));

        var plan = await _reverser.PlanAsync("key-26", null);
        await Assert.ThrowsAsync<InvalidOperationException>(() => _reverser.ApplyAsync(plan.Value));

        // Which is what the held, expired claim now answers - to this retry and every one
        // after it.
        _audit.Setup(a => a.TryBeginReversalAsync("key-26", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ReversalClaim(ReversalClaimOutcome.Interrupted));

        foreach (var _ in Enumerable.Range(0, 3))
        {
            var retry = await _reverser.ApplyAsync(plan.Value);
            Assert.False(retry.Value.Single().Reversed);
            Assert.Contains("stopped before it could record its outcome", retry.Value.Single().Detail);
        }

        Assert.Equal(1, created);
    }

    /// <summary>
    /// The ordering half of the same fix. A batch is planned newest-first because the older
    /// steps depend on the newer ones being undone first; skipping a newest step whose
    /// outcome is unknown and pressing on to its dependants is exactly the violation that
    /// rule exists to prevent.
    /// </summary>
    [Fact]
    public async Task A_Batch_Stops_When_Its_Newest_Step_Is_Already_Being_Reversed()
    {
        var create = Completed("key-e", "create-pack", "Pack", 5, batchId: "batch-3");
        var add = Completed(
            "key-f", "add-to-pack", "Model", 7,
            before: "{\"packId\":5,\"wasMember\":false}", after: "{\"packId\":5,\"modelId\":7}", batchId: "batch-3");
        Records(create, add);
        _audit.Setup(a => a.FindBatchAsync("batch-3", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AgentOperationLog> { create, add });

        // The newest step - removing the member - is held by another caller.
        _audit.Setup(a => a.TryBeginReversalAsync("key-f", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ReversalClaim(ReversalClaimOutcome.InProgress));

        var plan = await _reverser.PlanAsync(null, "batch-3");
        var result = await _reverser.ApplyAsync(plan.Value);

        // One reported step, and the pack delete behind it was never attempted.
        Assert.Single(result.Value);
        Assert.Equal("key-f", result.Value[0].IdempotencyKey);
        Assert.False(result.Value[0].Reversed);
        _deletePack.Verify(
            h => h.Handle(It.IsAny<DeletePackCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        _audit.Verify(
            a => a.TryBeginReversalAsync("key-a", It.IsAny<CancellationToken>()), Times.Never);
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
    public async Task An_Unwrap_Says_Why_It_Cannot_Be_Called_Back()
    {
        // generate_uvs returns before the work has produced anything, so the entry holds a
        // job id and not a version - there is no id here to undo. The blocker has to say
        // what to do instead, because unlike a re-derive this operation DID create state.
        var entry = Completed("key-uv", "generate-uvs", "Model", 812);
        Records(entry);

        var plan = await _reverser.PlanAsync("key-uv", null);

        var step = plan.Value.Steps.Single();
        Assert.False(step.IsSupported);
        Assert.Contains("delete that version", step.Blocker);
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
        // Reverse order: a row has no anchors so it does not care, but the same code undoes a
        // heterogeneous batch, where the vase must come off the table before the table goes.
        Assert.Equal(["lamp-3", "lamp-2", "lamp-1"], removed);
    }

    [Fact]
    public async Task Undoing_A_Batch_Removes_What_Rests_On_Something_Before_The_Thing_It_Rests_On()
    {
        // The batch placed the table first so the lamp could rest on it. Removing in that
        // same order would hit "a node cannot be removed while something rests on it" and
        // leave the layout half-undone.
        var entry = Completed(
            "key-batch", "place-assets-batch", "Scene", 3,
            before: "{\"removedNodeIds\":[\"table\",\"lamp\"]}");
        Records(entry);
        var removed = new List<string>();
        _removeSceneNode.Setup(h => h.Handle(It.IsAny<RemoveSceneNodeCommand>(), It.IsAny<CancellationToken>()))
            .Callback<RemoveSceneNodeCommand, CancellationToken>((c, _) => removed.Add(c.NodeId))
            .ReturnsAsync(Result.Success(new SceneNodeRemovalResponse(null!, null!)));

        var plan = await _reverser.PlanAsync("key-batch", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        Assert.Equal(["lamp", "table"], removed);
    }

    // ---- a composite inverse that fails partway ------------------------------
    //
    // `distribute-assets`, `place-assets-batch` and `create-room` are one reversal claim
    // over SEVERAL node removals, and every removal commits through the unit-of-work
    // decorator. Three of forty gone and then a failure used to leave those three durably
    // removed while the failure path handed the claim back as retryable - so the next
    // attempt re-ran an inverse that had already half happened, against a scene it had
    // already changed. The row is one transaction now: it comes off whole or not at all,
    // which is the only thing that makes releasing the claim an honest answer.

    /// <summary>
    /// Sets up a row whose removals succeed until <paramref name="failAt"/>, recording each
    /// removal against the unit of work so the test can tell staged from durable.
    /// </summary>
    private List<string> RowThatFailsAt(string? failAt, out AgentOperationLog entry)
    {
        entry = Completed(
            "key-row-partial", "distribute-assets", "Scene", 3,
            before: "{\"removedNodeIds\":[\"lamp-1\",\"lamp-2\",\"lamp-3\"]}");
        Records(entry);

        var attempted = new List<string>();
        _removeSceneNode.Setup(h => h.Handle(It.IsAny<RemoveSceneNodeCommand>(), It.IsAny<CancellationToken>()))
            .Returns<RemoveSceneNodeCommand, CancellationToken>((command, _) =>
            {
                attempted.Add(command.NodeId);
                if (command.NodeId == failAt)
                {
                    return Task.FromResult(Result.Failure<SceneNodeRemovalResponse>(
                        new Error("Scene.NodeInUse", $"'{command.NodeId}' still has something anchored to it.")));
                }

                // What a committing command handler does: the effect is written through the
                // unit of work, so an open transaction decides whether it becomes durable.
                _unitOfWork.Write($"removed {command.NodeId}");
                return Task.FromResult(Result.Success(new SceneNodeRemovalResponse(null!, null!)));
            });

        return attempted;
    }

    [Fact]
    public async Task A_Row_Whose_Later_Removal_Fails_Leaves_The_Earlier_Ones_In_Place()
    {
        // Reverse order, so 'lamp-3' comes off first and 'lamp-2' is the one that refuses -
        // an early success followed by a later failure, which is the shape of the bug.
        var attempted = RowThatFailsAt("lamp-2", out _);

        var plan = await _reverser.PlanAsync("key-row-partial", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.False(result.Value.Single().Reversed);
        Assert.Contains("anchored", result.Value.Single().Detail);

        // It stopped where it failed rather than pressing on...
        Assert.Equal(["lamp-3", "lamp-2"], attempted);
        // ...and 'lamp-3' - which the command reported as removed - is not durable, because
        // the whole row was one transaction and the transaction rolled back.
        Assert.Equal(1, _unitOfWork.Transactions);
        Assert.True(_unitOfWork.RolledBack);
        Assert.Empty(_unitOfWork.Durable);
    }

    [Fact]
    public async Task A_Row_That_Fails_Partway_Gives_Its_Reversal_Claim_Back()
    {
        // Releasing is correct ONLY because nothing survived the rollback. The claim going
        // back is what lets the user fix whatever blocked the removal and undo it properly;
        // it would be the bug if any of the row were still durably gone.
        RowThatFailsAt("lamp-2", out _);

        var plan = await _reverser.PlanAsync("key-row-partial", null);
        await _reverser.ApplyAsync(plan.Value);

        _audit.Verify(a => a.ReleaseReversalAsync(
            "key-row-partial", "rev-1", It.IsAny<CancellationToken>()), Times.Once);
        _audit.Verify(a => a.CompleteReversalAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _audit.Verify(a => a.InterruptReversalAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Row_That_Comes_Off_Whole_Commits_Every_Removal_In_One_Transaction()
    {
        // The positive control. Without it "nothing is durable" is equally consistent with a
        // rollback and with the removals never reaching the unit of work at all.
        RowThatFailsAt(failAt: null, out _);

        var plan = await _reverser.PlanAsync("key-row-partial", null);
        var result = await _reverser.ApplyAsync(plan.Value);

        Assert.True(result.Value.Single().Reversed);
        Assert.Equal(1, _unitOfWork.Transactions);
        Assert.False(_unitOfWork.RolledBack);
        Assert.Equal(["removed lamp-3", "removed lamp-2", "removed lamp-1"], _unitOfWork.Durable);
    }

    [Fact]
    public async Task A_Row_Whose_Removal_Throws_Keeps_The_Claim_And_Rolls_The_Row_Back()
    {
        // A throw says nothing about whether the write landed, so the claim is kept in the
        // interrupted state - and the transaction still unwinds what the row had staged.
        var entry = Completed(
            "key-row-throw", "place-assets-batch", "Scene", 3,
            before: "{\"removedNodeIds\":[\"table\",\"lamp\"]}");
        Records(entry);
        _removeSceneNode.Setup(h => h.Handle(It.IsAny<RemoveSceneNodeCommand>(), It.IsAny<CancellationToken>()))
            .Returns<RemoveSceneNodeCommand, CancellationToken>((command, _) =>
            {
                if (command.NodeId == "table")
                {
                    throw new InvalidOperationException("the connection went away");
                }

                _unitOfWork.Write($"removed {command.NodeId}");
                return Task.FromResult(Result.Success(new SceneNodeRemovalResponse(null!, null!)));
            });

        var plan = await _reverser.PlanAsync("key-row-throw", null);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _reverser.ApplyAsync(plan.Value));

        Assert.True(_unitOfWork.RolledBack);
        Assert.Empty(_unitOfWork.Durable);
        _audit.Verify(a => a.InterruptReversalAsync(
            "key-row-throw", "rev-1", It.IsAny<CancellationToken>()), Times.Once);
        _audit.Verify(a => a.ReleaseReversalAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
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

    // ---- set-scene-project and set-asset-metadata -------------------------------------
    // Both tools advertised "undoable with reverse_operation" in their own descriptions and
    // both recorded a before-state, but neither had a case here, so reverse_operation
    // answered "not a reversible operation". These pin the inverse that was promised.

    [Fact]
    public async Task Reversing_A_Scene_Project_Link_Restores_The_Previous_Project()
    {
        Records(Completed("k1", "set-scene-project", "Scene", 2,
            before: """{"projectId":7}""",
            after: """{"sceneId":2,"projectId":null}"""));
        _setSceneProject
            .Setup(h => h.Handle(It.IsAny<SetSceneProjectCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SetSceneProjectResponse(2, 7, "Restored", null, 5)));

        var plan = await _reverser.PlanAsync("k1", null);
        Assert.True(plan.Value.Steps[0].IsSupported);

        var applied = await _reverser.ApplyAsync(plan.Value);

        Assert.True(applied.Value[0].Reversed);
        _setSceneProject.Verify(h => h.Handle(
            It.Is<SetSceneProjectCommand>(c => c.SceneId == 2 && c.ProjectId == 7),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Reversing_A_Link_That_Replaced_No_Project_Unlinks_The_Scene()
    {
        // A scene that belonged to nothing is a state worth restoring, not a missing value.
        Records(Completed("k1", "set-scene-project", "Scene", 2,
            before: """{"projectId":null}""",
            after: """{"sceneId":2,"projectId":3}"""));
        _setSceneProject
            .Setup(h => h.Handle(It.IsAny<SetSceneProjectCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SetSceneProjectResponse(2, null, null, 3, 6)));

        var applied = await _reverser.ApplyAsync((await _reverser.PlanAsync("k1", null)).Value);

        Assert.True(applied.Value[0].Reversed);
        _setSceneProject.Verify(h => h.Handle(
            It.Is<SetSceneProjectCommand>(c => c.ProjectId == null), It.IsAny<CancellationToken>()), Times.Once);
    }

    private const string MetadataBefore = """
        {"assetType":"Model","assetId":9,"fields":[
          {"key":"styles","readOnly":false},
          {"key":"license","readOnly":false,"value":"CC0"},
          {"key":"description","readOnly":false,"value":"a chair"},
          {"key":"triangleCount","readOnly":true,"value":216}]}
        """;

    private const string MetadataAfter = """
        {"assetType":"Model","assetId":9,"fields":[
          {"key":"styles","readOnly":false,"value":["Low Poly"]},
          {"key":"license","readOnly":false,"value":"MIT"},
          {"key":"description","readOnly":false,"value":"a chair"},
          {"key":"triangleCount","readOnly":true,"value":216}]}
        """;

    [Fact]
    public async Task Reversing_A_Metadata_Write_Restores_Only_The_Fields_It_Changed()
    {
        // A metadata write is a merge, so the inverse must be one too. Restoring every
        // writable field would also overwrite ones this write never touched.
        Records(Completed("k1", "set-asset-metadata", "Model", 9,
            before: MetadataBefore, after: MetadataAfter));
        _setAssetMetadata
            .Setup(h => h.Handle(It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AssetMetadataResponse(
                "Model", 9, "chair", 1, 1, Array.Empty<AssetMetadataValue>(),
                new AssetMetadataCompleteness(0, 0, Array.Empty<string>()))));

        var applied = await _reverser.ApplyAsync((await _reverser.PlanAsync("k1", null)).Value);

        Assert.True(applied.Value[0].Reversed);
        _setAssetMetadata.Verify(h => h.Handle(
            It.Is<SetAssetMetadataCommand>(c =>
                // styles was unset before, so it is cleared; license goes back to CC0
                c.Fields.Count == 2
                && c.Fields.ContainsKey("styles")
                && c.Fields.ContainsKey("license")
                // description did not change, so it is not touched
                && !c.Fields.ContainsKey("description")
                // derived fields are never written back
                && !c.Fields.ContainsKey("triangleCount")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Reversing_A_Metadata_Write_That_Changed_Nothing_Writes_Nothing()
    {
        Records(Completed("k1", "set-asset-metadata", "Model", 9,
            before: MetadataAfter, after: MetadataAfter));

        var applied = await _reverser.ApplyAsync((await _reverser.PlanAsync("k1", null)).Value);

        Assert.True(applied.Value[0].Reversed);
        _setAssetMetadata.Verify(h => h.Handle(
            It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Metadata_Write_With_No_Recorded_Before_State_Is_Not_Reversible()
    {
        Records(Completed("k1", "set-asset-metadata", "Model", 9, before: null, after: MetadataAfter));

        var plan = await _reverser.PlanAsync("k1", null);

        Assert.False(plan.Value.Steps[0].IsSupported);
        Assert.Contains("not recorded", plan.Value.Steps[0].Blocker);
    }

    // The shape actually stored: audit payloads are serialized with default options, so a
    // payload built from a typed record (which AssetMetadataResponse is) arrives PascalCased.
    // The hand-written camelCase fixtures above passed while production silently restored
    // nothing, so these two pin the real shape.

    private const string PascalMetadataBefore = """
        {"AssetType":"Model","AssetId":9,"Fields":[
          {"Key":"styles","ReadOnly":false},
          {"Key":"license","ReadOnly":false,"Value":"CC0"},
          {"Key":"triangleCount","ReadOnly":true,"Value":216}]}
        """;

    private const string PascalMetadataAfter = """
        {"AssetType":"Model","AssetId":9,"Fields":[
          {"Key":"styles","ReadOnly":false,"Value":["Low Poly"]},
          {"Key":"license","ReadOnly":false,"Value":"CC0"},
          {"Key":"triangleCount","ReadOnly":true,"Value":216}]}
        """;

    [Fact]
    public async Task A_Metadata_Payload_Stored_In_Pascal_Case_Is_Still_Reversed()
    {
        Records(Completed("k1", "set-asset-metadata", "Model", 9,
            before: PascalMetadataBefore, after: PascalMetadataAfter));
        _setAssetMetadata
            .Setup(h => h.Handle(It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AssetMetadataResponse(
                "Model", 9, "chair", 1, 1, Array.Empty<AssetMetadataValue>(),
                new AssetMetadataCompleteness(0, 0, Array.Empty<string>()))));

        var applied = await _reverser.ApplyAsync((await _reverser.PlanAsync("k1", null)).Value);

        Assert.True(applied.Value[0].Reversed);
        _setAssetMetadata.Verify(h => h.Handle(
            It.Is<SetAssetMetadataCommand>(c =>
                c.Fields.Count == 1 && c.Fields.ContainsKey("styles")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task A_Metadata_Write_With_An_Unreadable_After_Payload_Fails_Rather_Than_Claiming_Success()
    {
        // Regression: an unreadable payload produced an empty diff, which was reported as
        // "already holds what it did before" and marked the entry reversed - a successful-
        // looking undo that restored nothing.
        Records(Completed("k1", "set-asset-metadata", "Model", 9,
            before: MetadataBefore, after: """{"unrelated":true}"""));

        var applied = await _reverser.ApplyAsync((await _reverser.PlanAsync("k1", null)).Value);

        Assert.False(applied.Value[0].Reversed);
        _setAssetMetadata.Verify(h => h.Handle(
            It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// A unit of work that models the one property these tests are about: work written
    /// while a transaction is open becomes durable when it commits, and is discarded when
    /// it rolls back. Enough to tell "the row came off whole" from "three nodes are gone
    /// and the caller was told nothing happened".
    /// </summary>
    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        private readonly List<string> _staged = [];
        private bool _open;

        /// <summary>What survived a committed transaction, in the order it was written.</summary>
        public List<string> Durable { get; } = [];

        /// <summary>How many transactions were opened - zero is the pre-fix behaviour.</summary>
        public int Transactions { get; private set; }

        public bool RolledBack { get; private set; }

        /// <summary>Stands in for a command handler's commit.</summary>
        public void Write(string effect)
        {
            if (_open)
            {
                _staged.Add(effect);
            }
            else
            {
                Durable.Add(effect);
            }
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public async Task<Result<T>> InTransactionAsync<T>(
            Func<CancellationToken, Task<Result<T>>> work,
            CancellationToken cancellationToken = default)
        {
            Transactions++;
            _open = true;
            try
            {
                var result = await work(cancellationToken);
                if (result.IsFailure)
                {
                    RolledBack = true;
                    _staged.Clear();
                    return result;
                }

                Durable.AddRange(_staged);
                _staged.Clear();
                return result;
            }
            catch
            {
                RolledBack = true;
                _staged.Clear();
                throw;
            }
            finally
            {
                _open = false;
            }
        }
    }
}
