using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>One proposal as a caller states it, before it is given an id.</summary>
/// <remarks>
/// Ids are deliberately not accepted from the caller. They are the names a user says out
/// loud, and their whole value is that <c>streetlight/B</c> means one asset for the life of
/// the scene - which a caller free to pick its own ids would break on the first retry.
/// </remarks>
public sealed record SceneCandidateProposal(
    string? AssetType = null,
    int? AssetId = null,
    int? VersionId = null,
    string? Rationale = null,
    string? Label = null,
    int? TextureSetId = null,
    int? MaterialId = null,
    string? Variant = null,
    string? StoreUrl = null,
    string? StoreAssetId = null,
    string? StoreTitle = null,
    string? StoreThumbnailUrl = null,
    decimal? StorePrice = null,
    string? StoreCurrency = null);

/// <summary>The state a slot write replaced, and everything its inverse needs to put back.</summary>
/// <param name="Slot">The slot as it was, or null when this write created it.</param>
/// <param name="Node">The slot's node before the write, when the write changed what it wears.</param>
public sealed record SceneSlotSnapshot(SceneSlot? Slot, SceneSlotNodeState? Node = null);

/// <summary>What a slot's node was wearing - the half of a resolution that lives outside the slot.</summary>
public sealed record SceneSlotNodeState(string NodeId, SceneAssetRef? Asset, SceneMaterialBinding? Material);

/// <summary>
/// The slot exactly as a write left it, recorded beside the write's inverse.
///
/// A slot id is stable for the life of a scene, but a node removed and recreated takes its
/// slot with it and a fresh slot may be opened under the same id with unrelated candidates.
/// The inverse uses this to tell whether what currently carries the id is still the slot the
/// write produced - overwriting or removing a different slot would silently discard it.
/// </summary>
public sealed record SceneSlotProduced(
    IReadOnlyList<string> CandidateIds,
    string? ChosenCandidateId,
    string? ResolvedBy,
    string? RecommendedCandidateId,
    string? ReopenedReason,
    string? Brief)
{
    /// <summary>Reads the identifying fields out of the projected view a write returns.</summary>
    public static SceneSlotProduced Of(SceneSlotView view) => new(
        view.Candidates.Select(c => c.Id).ToList(),
        view.ChosenCandidateId,
        view.ResolvedBy,
        view.RecommendedCandidateId,
        view.ReopenedReason,
        view.Brief);

    /// <summary>Whether the stored slot is still the one this fingerprint was taken from.</summary>
    public bool Matches(SceneSlot slot) =>
        CandidateIds.SequenceEqual(slot.Candidates.Select(c => c.Id), StringComparer.Ordinal)
        && string.Equals(ChosenCandidateId, slot.ChosenCandidateId, StringComparison.Ordinal)
        && string.Equals(ResolvedBy, slot.ResolvedBy, StringComparison.Ordinal)
        && string.Equals(RecommendedCandidateId, slot.RecommendedCandidateId, StringComparison.Ordinal)
        && string.Equals(ReopenedReason, slot.ReopenedReason, StringComparison.Ordinal)
        && string.Equals(Brief, slot.Brief, StringComparison.Ordinal);
}

/// <summary>The response every slot write returns, plus the inverse of what it just did.</summary>
public sealed record SceneSlotWriteResponse(SceneSummary Scene, SceneSlotView Slot, SceneSlotSnapshot Previous);

/// <summary>
/// Opens a decision for the user, or adds another round of proposals to one already open.
///
/// The slot's node has to exist first. Proposing does not place anything: it says what the
/// thing already standing in that spot might instead be, and a choice with nowhere to land
/// cannot be applied.
/// </summary>
public sealed record ProposeSceneCandidatesCommand(
    int SceneId,
    string SlotId,
    IReadOnlyList<SceneCandidateProposal> Candidates,
    string? Brief = null,
    int? ExpectedRevision = null) : ICommand<SceneSlotWriteResponse>;

/// <summary>
/// Settles a slot on one candidate, and applies that proposal to the slot's node.
/// </summary>
/// <param name="ResolvedBy">
/// From <see cref="SceneSlotResolvers"/>. Recorded because "the agent proposes, the user
/// decides" is only a guarantee while the scene can say which of the two happened.
/// </param>
/// <param name="Clear">Reopen the slot instead, leaving the node wearing whatever it wears.</param>
public sealed record ResolveSceneSlotCommand(
    int SceneId,
    string SlotId,
    string? CandidateId,
    string ResolvedBy,
    bool Clear = false,
    int? ExpectedRevision = null) : ICommand<SceneSlotWriteResponse>;

/// <summary>
/// Rules candidates out, with the reason that is the whole point of doing so.
/// </summary>
/// <param name="All">
/// The user's "none of these": rejects every candidate still standing and reopens the slot.
/// </param>
/// <param name="Reason">
/// Why. Required, because a rejection without one teaches the next round nothing and the
/// agent's only way to avoid repeating itself is to read these back.
/// </param>
public sealed record RejectSceneCandidatesCommand(
    int SceneId,
    string SlotId,
    IReadOnlyList<string>? CandidateIds,
    string Reason,
    bool All = false,
    int? ExpectedRevision = null) : ICommand<SceneSlotWriteResponse>;

/// <summary>
/// Puts a slot, and what its node was wearing, back exactly as they were.
///
/// The single inverse for all three slot writes. Propose, resolve and reject all amount to
/// replacing one slot, so one restore covers them rather than three bespoke undos that each
/// have to reason about which fields their forward operation touched.
/// </summary>
public sealed record RestoreSceneSlotCommand(
    int SceneId,
    string SlotId,
    SceneSlot? Slot,
    SceneSlotNodeState? Node = null,
    SceneSlotProduced? Produced = null) : ICommand<SceneSummary>;

/// <summary>Every decision in a scene, with what the library knows about each proposal.</summary>
public sealed record GetSceneSlotsQuery(int SceneId) : IQuery<SceneSlotsView>;
