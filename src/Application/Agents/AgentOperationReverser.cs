using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.EnvironmentMaps;
using Application.Models;
using Application.Packs;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.Models;
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
    private readonly ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse> _setDefaultTextureSet;
    private readonly ICommandHandler<RemoveTextureFromPackCommand> _removeTexture;
    private readonly ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse> _deleteModel;
    private readonly ICommandHandler<SoftDeleteSoundCommand> _deleteSound;
    private readonly ICommandHandler<SoftDeleteSpriteCommand> _deleteSprite;
    private readonly ICommandHandler<SoftDeleteEnvironmentMapCommand> _deleteEnvironmentMap;
    private readonly ICommandHandler<SoftDeleteTextureSetCommand, SoftDeleteTextureSetResponse> _deleteTextureSet;

    public AgentOperationReverser(
        IAgentAudit audit,
        ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> updateTags,
        ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse> setCategory,
        ICommandHandler<RemoveModelFromPackCommand> removeFromPack,
        ICommandHandler<DeletePackCommand> deletePack,
        ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse> setDefaultTextureSet,
        ICommandHandler<RemoveTextureFromPackCommand> removeTexture,
        ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse> deleteModel,
        ICommandHandler<SoftDeleteSoundCommand> deleteSound,
        ICommandHandler<SoftDeleteSpriteCommand> deleteSprite,
        ICommandHandler<SoftDeleteEnvironmentMapCommand> deleteEnvironmentMap,
        ICommandHandler<SoftDeleteTextureSetCommand, SoftDeleteTextureSetResponse> deleteTextureSet)
    {
        _audit = audit;
        _updateTags = updateTags;
        _setCategory = setCategory;
        _removeFromPack = removeFromPack;
        _deletePack = deletePack;
        _setDefaultTextureSet = setDefaultTextureSet;
        _removeTexture = removeTexture;
        _deleteModel = deleteModel;
        _deleteSound = deleteSound;
        _deleteSprite = deleteSprite;
        _deleteEnvironmentMap = deleteEnvironmentMap;
        _deleteTextureSet = deleteTextureSet;
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

        "bind-texture-set" => Step(entry, $"Restore model {entry.AssetId}'s previous default texture set.", destructive: false,
            supported: entry.PayloadBefore is not null,
            blocker: "The previous default texture set was not recorded."),

        "add-texture-channel" => Step(entry, "Remove the texture channel that was added to the set.", destructive: true,
            supported: entry.PayloadAfter is not null,
            blocker: "The added texture's id was not recorded."),

        "import-model" or "import-sound" or "import-sprite" or "import-environment-map" or "import-texture-set" =>
            Step(entry, $"Recycle the imported {entry.AssetType} {entry.AssetId} (soft delete - restorable from the recycle bin).",
                destructive: true,
                supported: entry.AssetId is > 0,
                blocker: "The imported asset's id was not recorded."),

        "trigger-rederive" => Step(entry, "Re-derivation cannot be undone.", destructive: false,
            supported: false,
            blocker: "Re-deriving an asset replaces computed data with freshly computed data - there is no prior state to restore, and nothing was lost."),

        _ => Step(entry, $"No inverse is defined for '{entry.Operation}'.", destructive: false,
            supported: false,
            blocker: $"'{entry.Operation}' is not a reversible operation."),
    };

    private static ReversalStep Step(
        AgentOperationLog entry, string description, bool destructive, bool supported, string blocker) =>
        new(entry.IdempotencyKey, entry.Operation, entry.AssetType, entry.AssetId,
            supported ? description : blocker, destructive, supported, supported ? null : blocker);

    private async Task<Result<string>> ApplyInverse(AgentOperationLog entry, CancellationToken cancellationToken)
    {
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
                if (before is null)
                {
                    return Result.Failure<string>(new Error("NoPriorState", "The previous default texture set was not recorded."));
                }

                var previousDefault = ReadInt(before.Value, "previousDefaultTextureSetId");
                var result = await _setDefaultTextureSet.Handle(
                    new SetDefaultTextureSetCommand(entry.AssetId!.Value, previousDefault), cancellationToken);

                return result.IsFailure
                    ? Result.Failure<string>(result.Error)
                    : Result.Success(previousDefault is null
                        ? $"Cleared model {entry.AssetId}'s default texture set, as it was before."
                        : $"Restored texture set {previousDefault} as model {entry.AssetId}'s default.");
            }

            case "add-texture-channel":
            {
                var after = Read(entry.PayloadAfter);
                var textureId = after is null ? null : ReadInt(after.Value, "textureId");
                if (textureId is null)
                {
                    return Result.Failure<string>(new Error("NoTextureRecorded", "The added texture's id was not recorded."));
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

    private static bool? ReadBool(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : null;
}
