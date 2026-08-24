using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// What claiming an idempotency key resolved to.
/// </summary>
/// <param name="Owned">The caller holds the claim and must apply its write.</param>
/// <param name="Existing">The entry that holds the key, when the caller does not own it.</param>
/// <param name="Interrupted">
/// The key is held by a claim whose owner died mid-flight, and whether that claim's
/// mutation landed is not recorded anywhere. Reported on <b>every</b> attempt, not handed
/// over.
/// </param>
/// <param name="ClaimToken">
/// The generation the caller now owns, when <paramref name="Owned"/>. Must be presented to
/// complete or abandon the claim, so a caller whose lease lapsed cannot settle the claim
/// that replaced it.
/// </param>
public sealed record ClaimTakeover(
    bool Owned,
    AgentOperationLog? Existing = null,
    bool Interrupted = false,
    string? ClaimToken = null);

/// <summary>What claiming an entry for reversal resolved to.</summary>
public enum ReversalClaimOutcome
{
    /// <summary>This caller owns the reversal and must apply the inverse.</summary>
    Claimed,

    /// <summary>The inverse already landed. Nothing to do.</summary>
    AlreadyReversed,

    /// <summary>Another caller is applying the inverse right now, within its lease.</summary>
    InProgress,

    /// <summary>
    /// A previous reversal was claimed and never settled. Its inverse may or may not have
    /// committed, so the entry is neither reversed nor free - it is reported, and a person
    /// decides.
    /// </summary>
    Interrupted,

    /// <summary>There is no entry under this key, or it never completed.</summary>
    NotReversible
}

/// <summary>The outcome of a reversal claim, with the token an owner must present to settle it.</summary>
public sealed record ReversalClaim(ReversalClaimOutcome Outcome, string? Token = null)
{
    public bool IsOwned => Outcome == ReversalClaimOutcome.Claimed;
}

/// <summary>
/// Append-only audit of agent-initiated writes (MCP write tools). Idempotency is
/// enforced by <b>claiming</b> the caller-supplied key before a write is applied - a
/// lookup-then-write check is not enough, because two concurrent calls carrying the
/// same key both pass the lookup and both apply the write.
///
/// Because the claim precedes the mutation, the claim row itself carries a status: a
/// row's mere existence proves only that someone started, never that anything landed.
/// </summary>
public interface IAgentOperationLogRepository
{
    /// <summary>
    /// Reserves <paramref name="claim"/>'s idempotency key.
    /// </summary>
    /// <remarks>
    /// A <c>Failed</c> claim is taken over silently: it was released deliberately, on a
    /// path that reported its own outcome, so retrying it is exactly what a retry is for.
    ///
    /// A claim left <c>Pending</c> past <paramref name="leaseMinutes"/> is different, and
    /// the difference is the whole reason these two are not one statement. Its owner died
    /// somewhere between claiming the key and finishing - possibly <b>after</b> its
    /// mutation committed but before the entry was marked Completed. Nothing recorded
    /// which, so re-running it silently is how one crash turns into two packs. Such a claim
    /// is moved to <c>Interrupted</c>, which is <b>terminal</b>: this and every later
    /// attempt on the key gets <see cref="ClaimTakeover.Interrupted"/> back. Releasing it
    /// into <c>Failed</c> after one report would only move the duplicate one call further
    /// away - the second press of the button is exactly the one that makes two packs.
    /// </remarks>
    Task<ClaimTakeover> TryClaimAsync(
        AgentOperationLog claim,
        int leaseMinutes,
        DateTime now,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an owned claim Completed - the only state a retry may replay as applied.
    /// A null <paramref name="payloadBefore"/> leaves whatever the claim already recorded,
    /// so a caller that captured the prior state at claim time does not lose it here.
    /// </summary>
    /// <param name="claimToken">
    /// The generation this caller was handed. The update matches on it, so a stale owner
    /// cannot stamp its outcome onto the claim that replaced its own.
    /// </param>
    /// <returns>False when this caller no longer owns the claim.</returns>
    Task<bool> CompleteClaimAsync(
        string idempotencyKey,
        string claimToken,
        string? assetType,
        int? assetId,
        string? payloadAfter,
        string? payloadBefore,
        DateTime completedAt,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an owned claim Failed, so a genuine retry is not turned away as
    /// "already applied" for an operation that never happened. The row is kept rather
    /// than deleted: the audit log should record the attempt.
    /// </summary>
    /// <returns>False when this caller no longer owns the claim.</returns>
    Task<bool> FailClaimAsync(
        string idempotencyKey,
        string claimToken,
        DateTime failedAt,
        CancellationToken cancellationToken = default);

    /// <summary>The entry for an idempotency key, if one exists.</summary>
    Task<AgentOperationLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default);

    /// <summary>
    /// Every entry in a batch, oldest first. Reversal walks this list <b>backwards</b>:
    /// a batch that created a pack and then filled it must be undone in the opposite
    /// order, or the pack delete trips over its own members.
    /// </summary>
    Task<IReadOnlyList<AgentOperationLog>> GetByBatchIdAsync(string batchId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Takes the exclusive right to apply one entry's inverse, <b>without</b> claiming the
    /// inverse happened.
    /// </summary>
    /// <remarks>
    /// Those two used to be one column. <c>ReversedAt</c> was stamped before the inverse ran
    /// - which is the correct place for a mutual exclusion and the wrong place for a record
    /// of fact, because an inverse that is cancelled, throws, or dies with its process then
    /// leaves an operation permanently marked as undone that was never undone. The claim now
    /// lives in <see cref="AgentOperationLog.ReversalToken"/> and the fact stays in
    /// <c>ReversedAt</c>, written only by <see cref="CompleteReversalAsync"/>.
    ///
    /// A claim past <paramref name="leaseMinutes"/> is <b>not</b> retaken. Its inverse may
    /// have committed before the process died, so it is
    /// <see cref="ReversalClaimOutcome.Interrupted"/> for the same reason an interrupted
    /// write claim is.
    /// </remarks>
    Task<ReversalClaim> TryBeginReversalAsync(
        string idempotencyKey,
        string reversalToken,
        int leaseMinutes,
        DateTime now,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Stamps <see cref="AgentOperationLog.ReversedAt"/> once the inverse has landed, on a
    /// reversal claim this caller still owns.
    /// </summary>
    /// <returns>False when the claim moved on - the caller must not report a reversal.</returns>
    Task<bool> CompleteReversalAsync(
        string idempotencyKey,
        string reversalToken,
        DateTime reversedAt,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gives back a reversal claim whose inverse could not be applied, so the operation can
    /// still be undone once whatever blocked it is fixed. Only ever affects a claim this
    /// caller owns, and never touches <see cref="AgentOperationLog.ReversedAt"/>.
    /// </summary>
    Task<bool> ReleaseReversalAsync(
        string idempotencyKey,
        string reversalToken,
        CancellationToken cancellationToken = default);
}
