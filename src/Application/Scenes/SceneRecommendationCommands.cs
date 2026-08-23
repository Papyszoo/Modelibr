using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>One slot and the candidate advised for it.</summary>
public sealed record SceneRecommendation(string SlotId, string CandidateId);

/// <summary>
/// States the agent's current advice across the scene, in one write.
///
/// A recommendation is <b>data, not card order</b>. Before this, the only way an agent could
/// say "I'd go with B" was to put B first or to say it in prose the scene does not keep -
/// and a UI that inferred a recommendation from position would be turning an implementation
/// detail into stated intent.
///
/// It resolves nothing. The node, <c>ChosenCandidateId</c> and <c>ResolvedBy</c> are
/// untouched, and the user remains free to pick a different candidate or none. That
/// separation is the whole feature: an agent that could recommend and choose with one verb
/// would have no way to advise without deciding.
/// </summary>
/// <param name="Recommendations">
/// The complete set. Slots not named here become unrecommended, so an agent can propose slot
/// by slot and then state one coherent combination in a single final call.
/// </param>
/// <param name="Summary">
/// Optional authored, user-facing rationale for the set as a whole. Null leaves the existing
/// summary alone; an empty string clears it.
/// </param>
public sealed record SetSceneRecommendationsCommand(
    int SceneId,
    IReadOnlyList<SceneRecommendation> Recommendations,
    string? Summary = null,
    int? ExpectedRevision = null) : ICommand<SceneRecommendationsResponse>;

/// <summary>
/// Puts the recommendation set and summary back exactly as they were.
///
/// The inverse of the above, and deliberately not the same command: a forward write requires
/// every named candidate to be open, while an undo restores advice that was legal when it
/// was given. Refusing to restore a recommendation because the user has since rejected that
/// candidate would make the undo fail on exactly the sequence it exists for.
/// </summary>
public sealed record RestoreSceneRecommendationsCommand(
    int SceneId,
    IReadOnlyList<SceneRecommendation> Recommendations,
    string? Summary) : ICommand<SceneRecommendationsResponse>;

/// <summary>
/// Accepts several recommendations at once, as the user.
///
/// Not N calls to <c>resolve_slot</c>: those would each move the revision, and a conflict
/// halfway through would leave "Accept all" a lie - some slots settled, some not, and no
/// single revision to report. Every pair is checked first; then all of them are applied
/// through one write.
/// </summary>
/// <remarks>
/// There is deliberately no agent-facing verb for this. <c>ResolvedBy</c> is fixed to
/// <see cref="SceneSlotResolvers.User"/> here, exactly as the single-choice REST endpoint
/// fixes it, so an agent cannot travel through this contract and have its own choices
/// recorded as the human's.
/// </remarks>
public sealed record AcceptSceneRecommendationsCommand(
    int SceneId,
    IReadOnlyList<SceneRecommendation> Choices,
    int? ExpectedRevision = null) : ICommand<SceneRecommendationsResponse>;

/// <summary>
/// The scene's new revision, the slots this write touched, and - for a recommendation write -
/// the set it replaced, so the write can be reversed.
/// </summary>
/// <param name="Summary">The scene's recommendation summary as it now stands.</param>
/// <param name="Previous">What the recommendation set was before this write. Null for an accept.</param>
public sealed record SceneRecommendationsResponse(
    SceneSummary Scene,
    IReadOnlyList<SceneSlotView> Slots,
    string? Summary,
    SceneRecommendationSnapshot? Previous = null);

/// <summary>Everything the inverse of a recommendation write needs.</summary>
public sealed record SceneRecommendationSnapshot(
    IReadOnlyList<SceneRecommendation> Recommendations,
    string? Summary);

/// <summary>What the two recommendation writes share: reading the set off a document, and writing one back.</summary>
internal static class SceneRecommendations
{
    /// <summary>The recommendation set a document currently states.</summary>
    public static IReadOnlyList<SceneRecommendation> Read(SceneDocument document) =>
        (document.Slots ?? Array.Empty<SceneSlot>())
            .Where(slot => slot.RecommendedCandidateId is not null)
            .Select(slot => new SceneRecommendation(slot.Id, slot.RecommendedCandidateId!))
            .ToList();

    /// <summary>
    /// Replaces the whole set. Slots the request does not name lose their recommendation,
    /// which is what makes this one statement about the scene rather than an accumulation of
    /// per-slot edits nobody can see the shape of.
    /// </summary>
    public static SceneDocument Write(
        SceneDocument document,
        IReadOnlyDictionary<string, string> byslot,
        string? summary)
    {
        var slots = (document.Slots ?? Array.Empty<SceneSlot>())
            .Select(slot => slot with
            {
                RecommendedCandidateId = byslot.TryGetValue(slot.Id, out var candidateId) ? candidateId : null,
            })
            .ToList();

        return document with
        {
            Slots = slots,
            RecommendationSummary = summary,
        };
    }

    /// <summary>
    /// Reads a requested set into a slot-keyed map, refusing a slot named twice.
    ///
    /// Two entries for one slot is not a set the document can hold - one of them would win
    /// silently, and which one would depend on array order.
    /// </summary>
    public static Result<Dictionary<string, string>> Index(
        IReadOnlyList<SceneRecommendation>? recommendations,
        string field)
    {
        var indexed = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var entry in recommendations ?? [])
        {
            if (string.IsNullOrWhiteSpace(entry.SlotId) || string.IsNullOrWhiteSpace(entry.CandidateId))
            {
                return Result.Failure<Dictionary<string, string>>(new Error(
                    "Scene.InvalidRecommendation",
                    $"Every entry in {field} needs both a slotId and a candidateId."));
            }

            if (!indexed.TryAdd(entry.SlotId, entry.CandidateId))
            {
                return Result.Failure<Dictionary<string, string>>(new Error(
                    "Scene.DuplicateRecommendation",
                    $"Slot '{entry.SlotId}' appears twice in {field}. A slot holds one recommendation."));
            }
        }

        return Result.Success(indexed);
    }
}

internal sealed class SetSceneRecommendationsCommandHandler
    : SceneSlotHandlerBase, ICommandHandler<SetSceneRecommendationsCommand, SceneRecommendationsResponse>
{
    public SetSceneRecommendationsCommandHandler(
        ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles, ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
        : base(writer, facts, profiles, media, constraints)
    {
    }

    public async Task<Result<SceneRecommendationsResponse>> Handle(
        SetSceneRecommendationsCommand command,
        CancellationToken cancellationToken)
    {
        var requested = SceneRecommendations.Index(command.Recommendations, "recommendations");
        if (requested.IsFailure)
        {
            return Result.Failure<SceneRecommendationsResponse>(requested.Error);
        }

        SceneRecommendationSnapshot? previous = null;

        var result = await Writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                previous = new SceneRecommendationSnapshot(
                    SceneRecommendations.Read(document), document.RecommendationSummary);

                foreach (var (slotId, candidateId) in requested.Value)
                {
                    var index = IndexOfSlot(document, slotId);
                    if (index < 0)
                    {
                        return Result.Failure<SceneDocument>(SlotNotFound(command.SceneId, slotId));
                    }

                    var slot = document.Slots![index];
                    var candidate = slot.Candidate(candidateId);

                    if (candidate is null)
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.CandidateNotFound",
                            $"Slot '{slotId}' has no candidate '{candidateId}'. It offers: " +
                            $"{(slot.Candidates.Count == 0 ? "nothing yet" : string.Join(", ", slot.Candidates.Select(c => c.Id)))}."));
                    }

                    // Recommending something already ruled out would put the user's own
                    // rejection back in front of them as advice.
                    if (candidate.IsRejected)
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.CandidateRejected",
                            $"Candidate '{SceneSlotViewBuilder.Ref(slotId, candidateId)}' was ruled out: {candidate.RejectedReason} " +
                            "Recommend one that is still open, or propose something new."));
                    }
                }

                return Result.Success(SceneRecommendations.Write(
                    document, requested.Value, command.Summary ?? document.RecommendationSummary));
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneRecommendationsResponse>(result.Error)
            : Result.Success(new SceneRecommendationsResponse(
                result.Value.View.Scene,
                await ProjectAllAsync(result.Value.Document, command.SceneId, requested.Value.Keys, cancellationToken),
                result.Value.Document.RecommendationSummary,
                previous));
    }
}

internal sealed class RestoreSceneRecommendationsCommandHandler
    : SceneSlotHandlerBase, ICommandHandler<RestoreSceneRecommendationsCommand, SceneRecommendationsResponse>
{
    public RestoreSceneRecommendationsCommandHandler(
        ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles, ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
        : base(writer, facts, profiles, media, constraints)
    {
    }

    public async Task<Result<SceneRecommendationsResponse>> Handle(
        RestoreSceneRecommendationsCommand command,
        CancellationToken cancellationToken)
    {
        var requested = SceneRecommendations.Index(command.Recommendations, "recommendations");
        if (requested.IsFailure)
        {
            return Result.Failure<SceneRecommendationsResponse>(requested.Error);
        }

        var result = await Writer.ApplyAsync(
            command.SceneId,
            expectedRevision: null,
            document =>
            {
                // Only the slots that still exist. A slot deleted since the recommendation was
                // given cannot take one back, and refusing the whole undo over it would leave
                // the rest of the advice wrongly restored to nothing.
                var surviving = requested.Value
                    .Where(entry => IndexOfSlot(document, entry.Key) >= 0)
                    .ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.Ordinal);

                return Result.Success(SceneRecommendations.Write(document, surviving, command.Summary));
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneRecommendationsResponse>(result.Error)
            : Result.Success(new SceneRecommendationsResponse(
                result.Value.View.Scene,
                await ProjectAllAsync(result.Value.Document, command.SceneId, requested.Value.Keys, cancellationToken),
                result.Value.Document.RecommendationSummary));
    }
}

internal sealed class AcceptSceneRecommendationsCommandHandler
    : SceneSlotHandlerBase, ICommandHandler<AcceptSceneRecommendationsCommand, SceneRecommendationsResponse>
{
    public AcceptSceneRecommendationsCommandHandler(
        ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles, ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
        : base(writer, facts, profiles, media, constraints)
    {
    }

    public async Task<Result<SceneRecommendationsResponse>> Handle(
        AcceptSceneRecommendationsCommand command,
        CancellationToken cancellationToken)
    {
        var requested = SceneRecommendations.Index(command.Choices, "choices");
        if (requested.IsFailure)
        {
            return Result.Failure<SceneRecommendationsResponse>(requested.Error);
        }

        if (requested.Value.Count == 0)
        {
            return Result.Failure<SceneRecommendationsResponse>(new Error(
                "Scene.NoChoices", "choices is empty; name the slot/candidate pairs to accept."));
        }

        var result = await Writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var slots = (document.Slots ?? Array.Empty<SceneSlot>()).ToList();
                var nodes = document.Nodes.ToArray();

                // Validated in full before anything is applied. A stale pair - the agent has
                // since recommended something else, or the user rejected it in another tab -
                // changes nothing at all, rather than settling the four slots before it.
                foreach (var (slotId, candidateId) in requested.Value)
                {
                    var index = IndexOfSlot(document, slotId);
                    if (index < 0)
                    {
                        return Result.Failure<SceneDocument>(SlotNotFound(command.SceneId, slotId));
                    }

                    var slot = slots[index];

                    if (!string.Equals(slot.RecommendedCandidateId, candidateId, StringComparison.Ordinal))
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.RecommendationChanged",
                            $"Slot '{slotId}' no longer recommends '{candidateId}'" +
                            $"{(slot.RecommendedCandidateId is { } now ? $" - it recommends '{now}' now" : " - it has no recommendation now")}. " +
                            "Re-read the slots and confirm again; nothing was accepted."));
                    }

                    if (slot.ChosenCandidateId is not null)
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.SlotAlreadyResolved",
                            $"Slot '{slotId}' has already settled on '{slot.ChosenCandidateId}'. Re-read the slots; nothing was accepted."));
                    }

                    var candidate = slot.Candidate(candidateId)!;

                    if (candidate.IsRejected)
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.CandidateRejected",
                            $"Candidate '{SceneSlotViewBuilder.Ref(slotId, candidateId)}' was ruled out: {candidate.RejectedReason} Nothing was accepted."));
                    }

                    if (candidate.IsFromStore)
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.CandidateNotInLibrary",
                            $"Candidate '{SceneSlotViewBuilder.Ref(slotId, candidateId)}' is a store asset, so accepting it means acquiring it first. Handle that one on its own card; nothing was accepted."));
                    }

                    var nodeIndex = IndexOfSlotNode(document, slotId);
                    if (nodeIndex < 0)
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.SlotNodeNotFound",
                            $"No node in scene {command.SceneId} carries slotId '{slotId}', so there is nowhere to apply the choice. Nothing was accepted."));
                    }

                    var node = nodes[nodeIndex];

                    // Same rule the single-choice path uses: the candidate is the whole answer
                    // for its slot, so an asset-only proposal drops the previous option's
                    // dressing rather than carrying it onto a different object.
                    nodes[nodeIndex] = node with
                    {
                        Asset = candidate.Asset ?? node.Asset,
                        Material = candidate.Asset is not null || candidate.Material is not null
                            ? candidate.Material
                            : node.Material,
                    };

                    slots[index] = slot with
                    {
                        ChosenCandidateId = candidate.Id,
                        ResolvedBy = SceneSlotResolvers.User,
                    };
                }

                return Result.Success(document with { Nodes = nodes, Slots = slots });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneRecommendationsResponse>(result.Error)
            : Result.Success(new SceneRecommendationsResponse(
                result.Value.View.Scene,
                await ProjectAllAsync(result.Value.Document, command.SceneId, requested.Value.Keys, cancellationToken),
                result.Value.Document.RecommendationSummary));
    }
}
