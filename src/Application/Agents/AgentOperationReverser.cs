using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.EnvironmentMaps;
using Application.Models;
using Application.Packs;
using Application.Scenes;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.Models;
using Domain.Scenes;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Agents;

/// <summary>One entry's inverse: what undoing it would do, and whether that is possible at all.</summary>
public sealed record ReversalStep(
    string IdempotencyKey,
    string Operation,
    string? AssetType,
    int? AssetId,
    string Description,
    bool IsDestructive,
    bool IsSupported,
    string? Blocker = null);

/// <summary>
/// What reversing an operation or a batch would do, in the order it would be applied.
/// A plan is produced before anything is touched so a dry run and a real run answer from
/// the same code - a preview that is computed differently from the action it previews is
/// a preview that can lie.
/// </summary>
public sealed record ReversalPlan(IReadOnlyList<ReversalStep> Steps)
{
    public bool IsEmpty => Steps.Count == 0;

    /// <summary>True when any step destroys work (deletes an asset) rather than restoring a prior value.</summary>
    public bool IsDestructive => Steps.Any(s => s.IsDestructive);

    public IReadOnlyList<ReversalStep> Unsupported => Steps.Where(s => !s.IsSupported).ToList();
}

/// <summary>The result of one applied step.</summary>
public sealed record ReversalStepResult(string IdempotencyKey, string Operation, bool Reversed, string Detail);

public interface IAgentOperationReverser
{
    /// <summary>
    /// Works out what undoing <paramref name="idempotencyKey"/> (one write) or
    /// <paramref name="batchId"/> (every write in a batch) would take. Exactly one of the
    /// two must be supplied.
    /// </summary>
    Task<Result<ReversalPlan>> PlanAsync(
        string? idempotencyKey,
        string? batchId,
        CancellationToken cancellationToken = default);

    /// <summary>Applies a plan, marking each entry reversed as its inverse lands.</summary>
    Task<Result<IReadOnlyList<ReversalStepResult>>> ApplyAsync(
        ReversalPlan plan,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Undo for agent writes.
///
/// The audit log has carried <c>PayloadBefore</c>, <c>BatchId</c> and <c>ReversedAt</c>
/// since it was introduced and nothing ever used them. This is what uses them: an agent
/// that mis-assigns forty texture channels, or tags a hundred models from a bad guess about
/// what they are, gets one call that puts the library back.
///
/// Two rules keep this honest:
///
/// <list type="bullet">
/// <item>An inverse is applied only where one genuinely exists. Re-deriving an asset cannot
/// be un-derived, and a plan says so rather than reporting a success it did not achieve.</item>
/// <item>A batch reverses <b>newest first</b>. Creating a pack and then filling it must be
/// undone in the opposite order, or deleting the pack fights its own members.</item>
/// </list>
///
/// Reversing an import is a soft delete, so undo itself is undoable: the asset lands in the
/// recycle bin the UI already exposes rather than being destroyed.
/// </summary>
internal sealed class AgentOperationReverser : IAgentOperationReverser
{
    private readonly IAgentAudit _audit;
    private readonly ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> _updateTags;
    private readonly ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse> _setCategory;
    private readonly ICommandHandler<RemoveModelFromPackCommand> _removeFromPack;
    private readonly ICommandHandler<DeletePackCommand> _deletePack;
    private readonly ICommandHandler<RemoveTextureFromPackCommand> _removeTexture;
    private readonly ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse> _addTexture;
    private readonly ICommandHandler<RestoreModelTextureBindingCommand> _restoreTextureBinding;
    private readonly ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse> _deleteModel;
    private readonly ICommandHandler<SoftDeleteSoundCommand> _deleteSound;
    private readonly ICommandHandler<SoftDeleteSpriteCommand> _deleteSprite;
    private readonly ICommandHandler<SoftDeleteEnvironmentMapCommand> _deleteEnvironmentMap;
    private readonly ICommandHandler<SoftDeleteTextureSetCommand, SoftDeleteTextureSetResponse> _deleteTextureSet;
    private readonly ICommandHandler<RemoveSceneNodeCommand, SceneNodeRemovalResponse> _removeSceneNode;
    private readonly ICommandHandler<RestoreSceneNodeCommand, SceneSummary> _restoreSceneNode;
    private readonly ICommandHandler<MoveSceneNodeCommand, SceneNodeMoveResponse> _moveSceneNode;
    private readonly ICommandHandler<SetSceneLightCommand, SceneLightResponse> _setSceneLight;
    private readonly ICommandHandler<ApplySceneMaterialCommand, SceneMaterialResponse> _applySceneMaterial;
    private readonly ICommandHandler<UpdateSceneDocumentCommand, SceneView> _updateSceneDocument;
    private readonly ICommandHandler<DeleteSceneCommand> _deleteScene;

    public AgentOperationReverser(
        IAgentAudit audit,
        ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> updateTags,
        ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse> setCategory,
        ICommandHandler<RemoveModelFromPackCommand> removeFromPack,
        ICommandHandler<DeletePackCommand> deletePack,
        ICommandHandler<RemoveTextureFromPackCommand> removeTexture,
        ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse> addTexture,
        ICommandHandler<RestoreModelTextureBindingCommand> restoreTextureBinding,
        ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse> deleteModel,
        ICommandHandler<SoftDeleteSoundCommand> deleteSound,
        ICommandHandler<SoftDeleteSpriteCommand> deleteSprite,
        ICommandHandler<SoftDeleteEnvironmentMapCommand> deleteEnvironmentMap,
        ICommandHandler<SoftDeleteTextureSetCommand, SoftDeleteTextureSetResponse> deleteTextureSet,
        ICommandHandler<RemoveSceneNodeCommand, SceneNodeRemovalResponse> removeSceneNode,
        ICommandHandler<RestoreSceneNodeCommand, SceneSummary> restoreSceneNode,
        ICommandHandler<MoveSceneNodeCommand, SceneNodeMoveResponse> moveSceneNode,
        ICommandHandler<SetSceneLightCommand, SceneLightResponse> setSceneLight,
        ICommandHandler<ApplySceneMaterialCommand, SceneMaterialResponse> applySceneMaterial,
        ICommandHandler<UpdateSceneDocumentCommand, SceneView> updateSceneDocument,
        ICommandHandler<DeleteSceneCommand> deleteScene)
    {
        _audit = audit;
        _updateTags = updateTags;
        _setCategory = setCategory;
        _removeFromPack = removeFromPack;
        _deletePack = deletePack;
        _removeTexture = removeTexture;
        _addTexture = addTexture;
        _restoreTextureBinding = restoreTextureBinding;
        _deleteModel = deleteModel;
        _deleteSound = deleteSound;
        _deleteSprite = deleteSprite;
        _deleteEnvironmentMap = deleteEnvironmentMap;
        _deleteTextureSet = deleteTextureSet;
        _removeSceneNode = removeSceneNode;
        _restoreSceneNode = restoreSceneNode;
        _moveSceneNode = moveSceneNode;
        _setSceneLight = setSceneLight;
        _applySceneMaterial = applySceneMaterial;
        _updateSceneDocument = updateSceneDocument;
        _deleteScene = deleteScene;
    }

    public async Task<Result<ReversalPlan>> PlanAsync(
        string? idempotencyKey,
        string? batchId,
        CancellationToken cancellationToken = default)
    {
        var hasKey = !string.IsNullOrWhiteSpace(idempotencyKey);
        var hasBatch = !string.IsNullOrWhiteSpace(batchId);

        if (hasKey == hasBatch)
        {
            return Result.Failure<ReversalPlan>(new Error(
                "AmbiguousTarget",
                "Supply exactly one of idempotencyKey or batchId - one names a single write, the other every write in a batch."));
        }

        IReadOnlyList<AgentOperationLog> entries;
        if (hasKey)
        {
            var entry = await _audit.FindAsync(idempotencyKey!, cancellationToken);
            if (entry is null)
            {
                return Result.Failure<ReversalPlan>(new Error(
                    "OperationNotFound", $"No agent operation was recorded under the key '{idempotencyKey}'."));
            }

            entries = new[] { entry };
        }
        else
        {
            entries = await _audit.FindBatchAsync(batchId!, cancellationToken);
            if (entries.Count == 0)
            {
                return Result.Failure<ReversalPlan>(new Error(
                    "BatchNotFound", $"No agent operations were recorded under the batch '{batchId}'."));
            }
        }

        // Newest first: a batch that created a pack and then filled it has to shed its
        // members before the pack itself can go.
        var steps = entries
            .Where(e => e.Status == AgentOperationStatus.Completed && e.ReversedAt is null)
            .Reverse()
            .Select(Describe)
            .ToList();

        return Result.Success(new ReversalPlan(steps));
    }

    public async Task<Result<IReadOnlyList<ReversalStepResult>>> ApplyAsync(
        ReversalPlan plan,
        CancellationToken cancellationToken = default)
    {
        var results = new List<ReversalStepResult>();

        foreach (var step in plan.Steps)
        {
            if (!step.IsSupported)
            {
                results.Add(new ReversalStepResult(
                    step.IdempotencyKey, step.Operation, Reversed: false, step.Blocker ?? "No inverse exists."));
                continue;
            }

            var entry = await _audit.FindAsync(step.IdempotencyKey, cancellationToken);
            if (entry is null || entry.ReversedAt is not null)
            {
                results.Add(new ReversalStepResult(
                    step.IdempotencyKey, step.Operation, Reversed: false, "Already reversed."));
                continue;
            }

            var applied = await ApplyInverse(entry, cancellationToken);
            if (applied.IsFailure)
            {
                // Stop at the first failure rather than pressing on: the remaining steps
                // were planned against a state this failure means we are no longer in, and
                // a partial undo the caller cannot see is worse than a reported one.
                results.Add(new ReversalStepResult(
                    step.IdempotencyKey, step.Operation, Reversed: false, applied.Error.Message));

                return Result.Success<IReadOnlyList<ReversalStepResult>>(results);
            }

            // Marked reversed only after its inverse landed, and only if this call is the
            // one that marked it - a concurrent undo of the same batch stops here.
            var marked = await _audit.TryMarkReversedAsync(step.IdempotencyKey, cancellationToken);
            results.Add(new ReversalStepResult(
                step.IdempotencyKey,
                step.Operation,
                Reversed: marked,
                marked ? applied.Value : "Inverse applied, but another caller had already marked it reversed."));
        }

        return Result.Success<IReadOnlyList<ReversalStepResult>>(results);
    }

    /// <summary>
    /// What one entry's inverse is. Kept separate from applying it so that a dry run and a
    /// real run cannot disagree about what will happen.
    /// </summary>
    private static ReversalStep Describe(AgentOperationLog entry) => entry.Operation switch
    {
        "set-tags" => Step(entry, $"Restore the tags, description and category model {entry.AssetId} had before.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The prior tags were not recorded, so there is nothing to restore."),

        "set-category" => Step(entry, $"Restore model {entry.AssetId}'s previous category.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The prior category was not recorded, so there is nothing to restore."),

        "add-to-pack" => Step(entry, $"Remove model {entry.AssetId} from the pack it was added to.", destructive: false,
            supported: entry.PayloadAfter is not null,
            blocker: "The pack this model was added to was not recorded."),

        "create-pack" => Step(entry, $"Delete pack {entry.AssetId}.", destructive: true,
            supported: entry.AssetId is > 0,
            blocker: "The created pack's id was not recorded."),

        "bind-texture-set" => Step(
            entry,
            $"Restore model {entry.AssetId}'s texture bindings - every version's mappings for this material and the default set each one rendered with.",
            destructive: false,
            supported: BindingBefore(entry) is not null,
            blocker: "The bindings this write replaced were not recorded, so there is nothing to restore. " +
                     "Entries written before the bind snapshot existed recorded only the active version's default and cannot be reversed correctly."),

        "add-texture-channel" => Step(
            entry,
            ReadDisplacedChannel(entry) is null
                ? "Remove the texture channel that was added to the set."
                : "Put back the texture channel this add replaced, displacing the one it added.",
            destructive: true,
            supported: entry.PayloadAfter is not null,
            blocker: "The added texture's id was not recorded."),

        "import-model" or "import-sound" or "import-sprite" or "import-environment-map" or "import-texture-set" =>
            DeduplicatedImport(entry)
                ? Step(entry, "Nothing to undo.", destructive: false, supported: false,
                    blocker: $"This import matched {entry.AssetType?.ToLowerInvariant() ?? "an asset"} {entry.AssetId}, which was already in the library, so it created nothing. Recycling it would delete work the agent never added.")
                : Step(entry, $"Recycle the imported {entry.AssetType} {entry.AssetId} (soft delete - restorable from the recycle bin).",
                    destructive: true,
                    supported: entry.AssetId is > 0,
                    blocker: "The imported asset's id was not recorded."),

        // Scene authoring. Each of these records the exact inverse in PayloadBefore at write
        // time, which is why undoing twenty placements is twenty removals rather than a
        // best-effort reconstruction of what the scene used to look like.
        "place-asset" => Step(entry, $"Remove the node this call placed in scene {entry.AssetId}.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The placed node's id was not recorded."),

        "distribute-assets" => Step(entry, $"Remove the row of nodes this call placed in scene {entry.AssetId}.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The placed nodes' ids were not recorded."),

        "move-asset" => Step(entry, $"Put the node back where it was in scene {entry.AssetId}.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The node's previous transform was not recorded."),

        "remove-asset" => Step(entry, $"Restore the node that was removed from scene {entry.AssetId}.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The removed node was not recorded, so there is nothing to restore."),

        "set-light" => Step(entry, $"Restore scene {entry.AssetId}'s light to its previous state.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The light's previous state was not recorded."),

        "apply-material" => Step(entry, $"Restore the node's previous material binding in scene {entry.AssetId}.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The previous material binding was not recorded."),

        "update-scene-document" => Step(entry, $"Restore scene {entry.AssetId}'s previous document.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The previous document was not recorded."),

        "create-scene" => Step(entry, $"Delete scene {entry.AssetId}.", destructive: true,
            supported: entry.AssetId is > 0,
            blocker: "The created scene's id was not recorded."),

        "trigger-rederive" => Step(entry, "Re-derivation cannot be undone.", destructive: false,
            supported: false,
            blocker: "Re-deriving an asset replaces computed data with freshly computed data - there is no prior state to restore, and nothing was lost."),

        _ => Step(entry, $"No inverse is defined for '{entry.Operation}'.", destructive: false,
            supported: false,
            blocker: $"'{entry.Operation}' is not a reversible operation."),
    };

    /// <summary>The binding snapshot a <c>bind-texture-set</c> recorded, or null when it has none.</summary>
    private static ModelTextureBindingSnapshot? BindingBefore(AgentOperationLog entry)
    {
        var before = Read(entry.PayloadBefore);
        return before is null ? null : ReadBinding(before.Value);
    }

    private static ModelTextureBindingSnapshot? ReadBinding(JsonElement before) =>
        ReadPayload<ModelTextureBindingSnapshot>(before, "binding");

    /// <summary>The channel an <c>add-texture-channel</c> displaced, as recorded before the write.</summary>
    private sealed record DisplacedChannel(int FileId, TextureType TextureType, TextureChannel? SourceChannel);

    /// <summary>
    /// Reads the displaced channel out of an entry's <c>PayloadBefore</c>. Null means the add
    /// filled an empty slot, so its inverse is a plain removal. An unreadable or unparseable
    /// record is also null: undoing by removal is the pre-existing behaviour, and it is
    /// strictly safer than re-adding a file id that did not parse.
    /// </summary>
    private static DisplacedChannel? ReadDisplacedChannel(AgentOperationLog entry)
    {
        // Before, then after: the MCP tool records it as this write's "before", while an
        // audited HTTP upload records the endpoint's whole response, which carries the same
        // field. Reading both is what makes a remote add-channel as reversible as a local one.
        return FindReplaced(entry.PayloadBefore) ?? FindReplaced(entry.PayloadAfter);
    }

    private static DisplacedChannel? FindReplaced(string? payload)
    {
        var root = Read(payload);
        if (root is null || !TryGetPropertyAnyCase(root.Value, "replacedTexture", out var replaced) ||
            replaced.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var fileId = ReadIntAnyCase(replaced, "fileId");
        var typeName = ReadStringAnyCase(replaced, "textureType");
        if (fileId is null || typeName is null || !Enum.TryParse<TextureType>(typeName, ignoreCase: true, out var type))
        {
            return null;
        }

        var channelName = ReadStringAnyCase(replaced, "sourceChannel");
        TextureChannel? channel = channelName is not null &&
            Enum.TryParse<TextureChannel>(channelName, ignoreCase: true, out var parsedChannel)
            ? parsedChannel
            : null;

        return new DisplacedChannel(fileId.Value, type, channel);
    }

    /// <summary>
    /// Whether an import entry recorded a deduplicated hit rather than a new asset.
    ///
    /// Import is content-addressed: re-importing bytes the library already holds returns the
    /// existing asset and creates nothing. The audit row still names that asset, so undoing
    /// it naively recycles an asset the agent never added - the user's original. Both writers
    /// record the flag (the MCP tool as <c>alreadyExisted</c>, the HTTP data plane as the
    /// endpoint DTO's <c>AlreadyExists</c>), so both spellings are read here.
    /// </summary>
    private static bool DeduplicatedImport(AgentOperationLog entry)
    {
        var after = Read(entry.PayloadAfter);
        return after is not null &&
               (ReadBoolAnyCase(after.Value, "alreadyExisted") == true ||
                ReadBoolAnyCase(after.Value, "alreadyExists") == true);
    }

    private static ReversalStep Step(
        AgentOperationLog entry, string description, bool destructive, bool supported, string blocker) =>
        new(entry.IdempotencyKey, entry.Operation, entry.AssetType, entry.AssetId,
            supported ? description : blocker, destructive, supported, supported ? null : blocker);

    private async Task<Result<string>> ApplyInverse(AgentOperationLog entry, CancellationToken cancellationToken)
    {
        // Checked again here, not only while planning: every import inverse is a delete, and
        // a deduplicated import would delete an asset that predates the agent entirely.
        if (entry.Operation.StartsWith("import-", StringComparison.Ordinal) && DeduplicatedImport(entry))
        {
            return Result.Failure<string>(new Error(
                "NothingImported",
                $"This import matched an asset already in the library ({entry.AssetType} {entry.AssetId}), so it created nothing to undo."));
        }

        switch (entry.Operation)
        {
            case "set-tags":
            {
                var before = Read(entry.PayloadBefore);
                if (before is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The prior tags were not recorded."));
                }

                var tags = ReadStringArray(before.Value, "tags");
                var description = ReadString(before.Value, "description");
                var categoryId = ReadInt(before.Value, "categoryId");

                var result = await _updateTags.Handle(
                    new UpdateModelTagsCommand(entry.AssetId!.Value, tags, description, categoryId), cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Restored {tags.Count} tag(s) on model {entry.AssetId}.");
            }

            case "set-category":
            {
                var before = Read(entry.PayloadBefore);
                if (before is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The prior category was not recorded."));
                }

                var categoryId = ReadInt(before.Value, "categoryId");
                var result = await _setCategory.Handle(
                    new SetModelCategoryCommand(entry.AssetId!.Value, categoryId), cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success(categoryId is null
                        ? $"Cleared model {entry.AssetId}'s category, as it was before."
                        : $"Restored model {entry.AssetId} to category {categoryId}.");
            }

            case "add-to-pack":
            {
                var after = Read(entry.PayloadAfter);
                var packId = after is null ? null : ReadInt(after.Value, "packId");
                if (packId is null)
                {
                    return Result.Failure<string>(new Error("NoPackRecorded", "The pack this model was added to was not recorded."));
                }

                // A model that was already in the pack before the agent touched it stays:
                // the write added nothing, so its inverse removes nothing.
                var before = Read(entry.PayloadBefore);
                if (before is not null && ReadBool(before.Value, "wasMember") == true)
                {
                    return Result.Success($"Model {entry.AssetId} was already in pack {packId} beforehand - left in place.");
                }

                var result = await _removeFromPack.Handle(
                    new RemoveModelFromPackCommand(packId.Value, entry.AssetId!.Value), cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Removed model {entry.AssetId} from pack {packId}.");
            }

            case "create-pack":
            {
                var result = await _deletePack.Handle(new DeletePackCommand(entry.AssetId!.Value), cancellationToken);
                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Deleted pack {entry.AssetId}.");
            }

            case "bind-texture-set":
            {
                var before = Read(entry.PayloadBefore);
                var binding = before is null ? null : ReadBinding(before.Value);
                if (binding is null)
                {
                    return Result.Failure<string>(new Error(
                        "NoPriorState", "The bindings this write replaced were not recorded."));
                }

                // The whole slot across every version, not just the active version's default:
                // the write mapped the set into all of them and displaced what was there.
                var result = await _restoreTextureBinding.Handle(
                    new RestoreModelTextureBindingCommand(binding), cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success(
                        $"Restored model {entry.AssetId}'s texture bindings across {binding.Versions.Count} version(s).");
            }

            case "add-texture-channel":
            {
                var after = Read(entry.PayloadAfter);
                var textureId = after is null ? null : ReadIntAnyCase(after.Value, "textureId");
                if (textureId is null)
                {
                    return Result.Failure<string>(new Error("NoTextureRecorded", "The added texture's id was not recorded."));
                }

                // Re-adding the displaced file is the whole inverse: adding a channel removes
                // the same-typed one first, so putting the original back evicts the one this
                // write added. Removing the new texture on its own would leave the set short
                // the map it displaced - reported as reversed, but not restored.
                var displaced = ReadDisplacedChannel(entry);
                if (displaced is not null)
                {
                    var restored = await _addTexture.Handle(
                        new AddTextureToTextureSetCommand(
                            entry.AssetId!.Value, displaced.FileId, displaced.TextureType, displaced.SourceChannel),
                        cancellationToken);

                    return restored.IsFailure
                        ? Result.Failure<string>(restored.Error)
                        : Result.Success(
                            $"Restored the previous {displaced.TextureType} channel in set {entry.AssetId}, replacing texture {textureId}.");
                }

                var result = await _removeTexture.Handle(
                    new RemoveTextureFromPackCommand(entry.AssetId!.Value, textureId.Value), cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Removed texture {textureId} from set {entry.AssetId}.");
            }

            case "import-model":
            {
                var result = await _deleteModel.Handle(new SoftDeleteModelCommand(entry.AssetId!.Value), cancellationToken);
                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Recycled model {entry.AssetId}.");
            }

            case "import-sound":
            {
                var result = await _deleteSound.Handle(new SoftDeleteSoundCommand(entry.AssetId!.Value), cancellationToken);
                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Recycled sound {entry.AssetId}.");
            }

            case "import-sprite":
            {
                var result = await _deleteSprite.Handle(new SoftDeleteSpriteCommand(entry.AssetId!.Value), cancellationToken);
                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Recycled sprite {entry.AssetId}.");
            }

            case "import-environment-map":
            {
                var result = await _deleteEnvironmentMap.Handle(
                    new SoftDeleteEnvironmentMapCommand(entry.AssetId!.Value), cancellationToken);
                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Recycled environment map {entry.AssetId}.");
            }

            case "import-texture-set":
            {
                var result = await _deleteTextureSet.Handle(
                    new SoftDeleteTextureSetCommand(entry.AssetId!.Value), cancellationToken);
                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Recycled texture set {entry.AssetId}.");
            }

            case "place-asset":
            {
                var before = Read(entry.PayloadBefore);
                var nodeId = before is null ? null : ReadString(before.Value, "removedNodeId");
                if (nodeId is null)
                {
                    return Result.Failure<string>(new Error("NoNodeRecorded", "The placed node's id was not recorded."));
                }

                var result = await _removeSceneNode.Handle(
                    new RemoveSceneNodeCommand(entry.AssetId!.Value, nodeId), cancellationToken);

                // Already gone is the desired end state, not a failure - the user may have
                // deleted the node themselves before asking for the undo.
                return result.IsFailure && result.Error.Code != "Scene.NodeNotFound"
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Removed node '{nodeId}' from scene {entry.AssetId}.");
            }

            case "distribute-assets":
            {
                var before = Read(entry.PayloadBefore);
                var nodeIds = before is null
                    ? Array.Empty<string>()
                    : ReadStringArray(before.Value, "removedNodeIds").ToArray();
                if (nodeIds.Length == 0)
                {
                    return Result.Failure<string>(new Error("NoNodesRecorded", "The placed nodes' ids were not recorded."));
                }

                foreach (var nodeId in nodeIds)
                {
                    var removed = await _removeSceneNode.Handle(
                        new RemoveSceneNodeCommand(entry.AssetId!.Value, nodeId), cancellationToken);

                    // Already gone is the desired end state, not a failure - the user may
                    // have deleted some of the row themselves before asking for the undo.
                    if (removed.IsFailure && removed.Error.Code != "Scene.NodeNotFound")
                    {
                        return Result.Failure<string>(removed.Error);
                    }
                }

                return Result.Success($"Removed {nodeIds.Length} node(s) from scene {entry.AssetId}.");
            }

            case "move-asset":
            {
                var before = Read(entry.PayloadBefore);
                var nodeId = before is null ? null : ReadString(before.Value, "nodeId");
                var transform = before is null ? null : ReadPayload<SceneTransform>(before.Value, "transform");
                if (nodeId is null || transform is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The node's previous transform was not recorded."));
                }

                // Exact: the recorded placement is the whole prior state. A merging undo would
                // keep whatever the write attached the node to, or left it facing, and report
                // success anyway. Entries logged before placement rules existed carry none of
                // these keys, which reads as "nothing set" - which is what was true then.
                var anchor = ReadPayload<SceneAnchor>(before!.Value, "anchor");
                var result = await _moveSceneNode.Handle(
                    new MoveSceneNodeCommand(
                        entry.AssetId!.Value, nodeId, transform.Position, transform.RotationEuler, transform.Scale,
                        GroundSnap: ReadBool(before.Value, "groundSnap"),
                        FaceToward: ReadVector(before.Value, "faceToward"),
                        FrontAxis: ReadString(before.Value, "frontAxis"),
                        AnchorTo: anchor?.OnNodeId,
                        // "Keep" when the offset was never captured, so the node is re-seated
                        // where it stands rather than yanked to the centre of its anchor.
                        AnchorAlign: anchor is { Offset: null } ? SceneAnchorAlignments.Keep : null,
                        AnchorOffset: anchor?.Offset,
                        Exact: true),
                    cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Restored node '{nodeId}' to its previous transform in scene {entry.AssetId}.");
            }

            case "remove-asset":
            {
                var before = Read(entry.PayloadBefore);
                var node = before is null ? null : ReadPayload<SceneNode>(before.Value, "restoredNode");
                if (node is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The removed node was not recorded."));
                }

                var result = await _restoreSceneNode.Handle(
                    new RestoreSceneNodeCommand(entry.AssetId!.Value, node), cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Restored node '{node.Id}' to scene {entry.AssetId}.");
            }

            case "set-light":
            {
                var before = Read(entry.PayloadBefore);
                var lightId = before is null ? null : ReadString(before.Value, "lightId");
                if (lightId is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The light's previous state was not recorded."));
                }

                // No previous light means the write created one, so its inverse deletes it.
                var previous = ReadPayload<SceneLight>(before!.Value, "light");
                // Exact: the recorded light is the whole prior state, so a light that had no
                // target or no name is restored without one. Merge semantics would keep
                // whatever the write put there and report the undo as successful anyway.
                var command = previous is null
                    ? new SetSceneLightCommand(entry.AssetId!.Value, lightId, Remove: true)
                    : new SetSceneLightCommand(
                        entry.AssetId!.Value, lightId, previous.Type, previous.Position,
                        previous.Intensity, previous.Color, previous.Target, previous.Name,
                        Exact: true);

                var result = await _setSceneLight.Handle(command, cancellationToken);

                return result.IsFailure && result.Error.Code != "Scene.LightNotFound"
                    ? Result.Failure<string>(result.Error)
                    : Result.Success(previous is null
                        ? $"Removed light '{lightId}' from scene {entry.AssetId}, which is how it was before."
                        : $"Restored light '{lightId}' in scene {entry.AssetId}.");
            }

            case "apply-material":
            {
                var before = Read(entry.PayloadBefore);
                var nodeId = before is null ? null : ReadString(before.Value, "nodeId");
                if (nodeId is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The previous material binding was not recorded."));
                }

                var previous = ReadPayload<SceneMaterialBinding>(before!.Value, "material");
                // Exact, for the same reason as the light above: a binding that carried no
                // variant is restorable only when null means null.
                var result = await _applySceneMaterial.Handle(
                    previous is null
                        ? new ApplySceneMaterialCommand(entry.AssetId!.Value, nodeId, Clear: true)
                        : new ApplySceneMaterialCommand(
                            entry.AssetId!.Value, nodeId, previous.TextureSetId, previous.Variant, Exact: true),
                    cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success(previous is null
                        ? $"Cleared node '{nodeId}'s material in scene {entry.AssetId}, as it was before."
                        : $"Restored node '{nodeId}'s previous material in scene {entry.AssetId}.");
            }

            case "update-scene-document":
            {
                var before = Read(entry.PayloadBefore);
                var document = before is null ? null : ReadPayload<SceneDocument>(before.Value, "document");
                if (document is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The previous document was not recorded."));
                }

                var result = await _updateSceneDocument.Handle(
                    new UpdateSceneDocumentCommand(entry.AssetId!.Value, SceneDocumentCodec.Serialize(document)),
                    cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Restored scene {entry.AssetId}'s previous document ({document.Nodes.Count} node(s)).");
            }

            case "create-scene":
            {
                var result = await _deleteScene.Handle(new DeleteSceneCommand(entry.AssetId!.Value), cancellationToken);
                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success($"Deleted scene {entry.AssetId}.");
            }

            default:
                return Result.Failure<string>(new Error(
                    "NotReversible", $"'{entry.Operation}' is not a reversible operation."));
        }
    }

    private static JsonElement? Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            // Cloned because the document is disposed with the using block; the element
            // would otherwise be read after its backing buffer is returned.
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IReadOnlyCollection<string> ReadStringArray(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Where(v => v.ValueKind == JsonValueKind.String).Select(v => v.GetString()!).ToList()
            : Array.Empty<string>();

    private static string? ReadString(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static int? ReadInt(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number
            ? value.GetInt32()
            : null;

    /// <summary>
    /// Reads a recorded contract type out of a payload property.
    ///
    /// Case-insensitive on purpose: the audit log serializes an anonymous wrapper with the
    /// default options (so the contract types inside come out PascalCase) while a scene
    /// document is stored camelCase. Reading either shape here is what stops undo from
    /// depending on which writer produced the row.
    /// </summary>
    private static T? ReadPayload<T>(JsonElement element, string property) where T : class
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        try
        {
            return value.Deserialize<T>(PayloadReadOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static readonly JsonSerializerOptions PayloadReadOptions = new() { PropertyNameCaseInsensitive = true };

    /// <summary>
    /// The struct twin of <see cref="ReadPayload{T}"/>: <see cref="Vec3"/> is a value type, so
    /// it cannot go through the class-constrained reader, and a recorded point still has to
    /// come back as "absent" rather than as the origin when the property is not there.
    /// </summary>
    private static Vec3? ReadVector(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        try
        {
            return value.Deserialize<Vec3>(PayloadReadOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool? ReadBool(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : null;

    /// <summary>
    /// A boolean property regardless of casing. Payloads reach the log from two writers with
    /// two casings - an anonymous type serialized as written by a tool, and an endpoint DTO
    /// serialized PascalCase - and a case-sensitive read would silently miss one of them.
    /// </summary>
    private static bool? ReadBoolAnyCase(JsonElement element, string property) =>
        TryGetPropertyAnyCase(element, property, out var value) &&
        value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : null;

    private static int? ReadIntAnyCase(JsonElement element, string property) =>
        TryGetPropertyAnyCase(element, property, out var value) && value.ValueKind == JsonValueKind.Number
            ? value.GetInt32()
            : null;

    private static string? ReadStringAnyCase(JsonElement element, string property) =>
        TryGetPropertyAnyCase(element, property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static bool TryGetPropertyAnyCase(JsonElement element, string property, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var candidate in element.EnumerateObject())
            {
                if (string.Equals(candidate.Name, property, StringComparison.OrdinalIgnoreCase))
                {
                    value = candidate.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }
}
