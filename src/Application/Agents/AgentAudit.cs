using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;

namespace Application.Agents;

/// <summary>
/// What a claim attempt resolved to.
/// </summary>
public enum AgentClaimOutcome
{
    /// <summary>The caller owns the claim and must apply its write.</summary>
    Owned,

    /// <summary>The operation already completed; replay its recorded result, do not re-apply.</summary>
    AlreadyApplied,

    /// <summary>Another caller holds a live claim for this key; the write may still be running.</summary>
    InProgress,

    /// <summary>
    /// A previous attempt on this key died mid-flight, and whether its mutation landed is
    /// not recorded anywhere. Terminal: the key answers this to every attempt, not just
    /// the first, because "check, then retry the same key" is a race a person cannot win
    /// and a duplicate nobody would see.
    /// </summary>
    Interrupted
}

/// <summary>
/// Outcome of <see cref="IAgentAudit.TryBeginAsync"/>, with the entry when there is one and
/// the claim generation when the caller owns it.
/// </summary>
/// <param name="ClaimToken">
/// What the owner must present to settle the claim. Not decoration: a caller whose lease
/// lapsed and whose row was taken over would otherwise still complete "its" key on the way
/// out, stamping its outcome onto the new owner's in-flight work.
/// </param>
public sealed record AgentClaim(
    AgentClaimOutcome Outcome,
    AgentOperationLog? Entry,
    string? ClaimToken = null)
{
    public bool IsOwned => Outcome == AgentClaimOutcome.Owned;
}

/// <summary>
/// Records agent-initiated writes (MCP write tools) into the append-only
/// <see cref="AgentOperationLog"/> and enforces idempotency: a repeated write carrying
/// the same key must not be re-applied. This is the audit + replay safety the write
/// surface requires (prompt 30 / the v0.6 full-agent-surface direction).
///
/// The key is <b>claimed before</b> the write runs, not merely looked up. A
/// lookup-then-write check is a check-then-act race: two concurrent calls with one key
/// both pass the lookup, both apply the write, and the second then trips the unique
/// index while its mutation has already landed - which is exactly how a batch import
/// with a retried key produced a duplicate pack.
///
/// Because the claim precedes the mutation, a claim row is not proof the mutation
/// happened. Only a <b>Completed</b> entry may be replayed as "already applied"; a live
/// Pending claim is reported as in-progress (retryable); and a claim whose owner died is
/// moved off Pending after its lease, so a crash cannot permanently wedge a key.
///
/// That last case is reported, and it keeps being reported. A claim that was Pending when
/// its owner died may have committed its mutation and died before the entry could be
/// marked Completed - the window between the two is small but it is real, and nothing in
/// the log distinguishes "never ran" from "ran and was not recorded". So the key moves to
/// <see cref="AgentOperationStatus.Interrupted"/>, which is terminal, and every attempt on
/// it answers <see cref="AgentClaimOutcome.Interrupted"/>. Releasing it into Failed after
/// one report would only postpone the duplicate by one call - and the retry that then
/// re-ran it would be the one nobody was watching.
/// </summary>
public interface IAgentAudit
{
    /// <summary>Claims <paramref name="write"/>'s key, reporting who owns it and in what state.</summary>
    Task<AgentClaim> TryBeginAsync(AgentWrite write, CancellationToken cancellationToken = default);

    /// <summary>How long a reversal claim is honoured before it counts as interrupted.</summary>
    int ReversalLeaseMinutes { get; }

    /// <summary>
    /// Records the outcome of a write that succeeded, on a claim this caller owns.
    ///
    /// <paramref name="payloadBefore"/> is accepted here, not only at claim time, because
    /// the state a write replaces is usually read <i>inside</i> the guarded body - after
    /// the claim. Without it the undo path has nothing to restore. Passing null leaves any
    /// claim-time value intact rather than erasing it.
    /// </summary>
    /// <param name="claimToken">
    /// The generation <see cref="TryBeginAsync"/> handed this caller. Returns false when it
    /// is no longer the current one - somebody else owns the key now, and this caller's
    /// outcome is not theirs to record.
    /// </param>
    Task<bool> CompleteAsync(
        string idempotencyKey,
        string claimToken,
        string? assetType = null,
        int? assetId = null,
        string? payloadAfter = null,
        string? payloadBefore = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an owned claim as failed, so retrying it is not turned away as
    /// "already applied" for an operation that never happened. Returns false when this
    /// caller no longer owns the claim.
    /// </summary>
    Task<bool> AbandonAsync(
        string idempotencyKey, string claimToken, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an owned claim <see cref="AgentOperationStatus.Interrupted"/> - the settle for a
    /// call that cannot say whether its mutation committed.
    ///
    /// <para>
    /// The guarded body commits before its entry is marked Completed, so an exception, a
    /// cancellation, or a completion that itself throws all leave the same question open:
    /// did the write land? <see cref="AbandonAsync"/> answers "no" and frees the key, which
    /// is right only for a path that knows. This answers "unknown", durably, and the key
    /// keeps answering it - because the alternative is the retry that quietly applies a
    /// create_pack twice.
    /// </para>
    /// </summary>
    /// <returns>False when this caller no longer owns the claim.</returns>
    Task<bool> InterruptAsync(
        string idempotencyKey,
        string claimToken,
        string? assetType = null,
        int? assetId = null,
        CancellationToken cancellationToken = default);

    /// <summary>The recorded entry for one idempotency key, or null if never claimed.</summary>
    Task<AgentOperationLog?> FindAsync(string idempotencyKey, CancellationToken cancellationToken = default);

    /// <summary>Every entry recorded under one batch id, oldest first.</summary>
    Task<IReadOnlyList<AgentOperationLog>> FindBatchAsync(string batchId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Takes the exclusive right to apply one entry's inverse, before any of it is applied.
    ///
    /// Claimed before rather than marked after: two callers marking afterwards have both
    /// already done the work, and for an inverse that creates something (recreating a
    /// deleted scene) doing it twice leaves two of it. <c>reverse_operation</c> carries no
    /// idempotency key of its own, so nothing upstream deduplicates them.
    ///
    /// The claim is <b>not</b> the record that the inverse happened - see
    /// <see cref="CompleteReversalAsync"/>, which is.
    /// </summary>
    Task<ReversalClaim> TryBeginReversalAsync(string idempotencyKey, CancellationToken cancellationToken = default);

    /// <summary>
    /// Records that the inverse landed, on a claim this caller still owns. Returns false
    /// when it does not - in which case the caller must not report a reversal.
    /// </summary>
    Task<bool> CompleteReversalAsync(
        string idempotencyKey, string reversalToken, CancellationToken cancellationToken = default);

    /// <summary>
    /// Holds on to a reversal claim whose inverse has an <b>unknown</b> outcome, leaving it
    /// in the state every later attempt reports as
    /// <see cref="ReversalClaimOutcome.Interrupted"/>.
    ///
    /// <para>
    /// <see cref="ReleaseReversalAsync"/> is for an inverse that is known not to have
    /// applied - it returned a failure before mutating. An inverse that threw, was
    /// cancelled, or could not have its completion recorded may already be durable, and
    /// releasing that claim is how one undo of a delete-scene becomes two scenes.
    /// </para>
    /// </summary>
    Task<bool> InterruptReversalAsync(
        string idempotencyKey, string reversalToken, CancellationToken cancellationToken = default);

    /// <summary>
    /// Releases a reversal claim whose inverse could not be applied, so the operation can
    /// be undone once whatever blocked it is fixed. Never touches the completed marker.
    /// </summary>
    Task ReleaseReversalAsync(
        string idempotencyKey, string reversalToken, CancellationToken cancellationToken = default);
}

/// <summary>Describes one agent write for the audit log.</summary>
public sealed record AgentWrite(
    string IdempotencyKey,
    string Operation,
    string? AssetType = null,
    int? AssetId = null,
    string? PayloadBefore = null,
    string? PayloadAfter = null,
    string? BatchId = null,
    string? Actor = null);

internal sealed class AgentAudit : IAgentAudit
{
    /// <summary>
    /// How long a Pending claim is honoured before it counts as abandoned. Long enough to
    /// cover the slowest write tool (a co-located import reads and hashes a file), short
    /// enough that a crashed caller doesn't block a retry for a working session.
    /// </summary>
    private const int ClaimLeaseMinutes = 15;

    /// <summary>
    /// How long a reversal claim is honoured. Shorter than the write lease because an
    /// inverse is a handful of local commands rather than a file read, and a stuck one
    /// should surface as ambiguous while somebody is still looking at it.
    /// </summary>
    private const int ReversalLease = 5;

    public int ReversalLeaseMinutes => ReversalLease;

    private readonly IAgentOperationLogRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AgentAudit(
        IAgentOperationLogRepository repository,
        IDateTimeProvider dateTimeProvider)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<AgentClaim> TryBeginAsync(AgentWrite write, CancellationToken cancellationToken = default)
    {
        var now = _dateTimeProvider.UtcNow;
        var claim = AgentOperationLog.Create(
            write.IdempotencyKey,
            write.Operation,
            now,
            batchId: write.BatchId,
            assetType: write.AssetType,
            assetId: write.AssetId,
            payloadBefore: write.PayloadBefore,
            payloadAfter: write.PayloadAfter,
            claimedBy: Environment.MachineName,
            actor: write.Actor);

        var takeover = await _repository.TryClaimAsync(claim, ClaimLeaseMinutes, now, cancellationToken);
        if (takeover.Owned)
        {
            return new AgentClaim(AgentClaimOutcome.Owned, null, takeover.ClaimToken);
        }

        var existing = takeover.Existing!;
        if (takeover.Interrupted)
        {
            return new AgentClaim(AgentClaimOutcome.Interrupted, existing);
        }

        return existing.Status == AgentOperationStatus.Completed
            ? new AgentClaim(AgentClaimOutcome.AlreadyApplied, existing)
            : new AgentClaim(AgentClaimOutcome.InProgress, existing);
    }

    public Task<bool> CompleteAsync(
        string idempotencyKey,
        string claimToken,
        string? assetType = null,
        int? assetId = null,
        string? payloadAfter = null,
        string? payloadBefore = null,
        CancellationToken cancellationToken = default) =>
        _repository.CompleteClaimAsync(
            idempotencyKey, claimToken, assetType, assetId, payloadAfter, payloadBefore,
            _dateTimeProvider.UtcNow, cancellationToken);

    public Task<bool> AbandonAsync(
        string idempotencyKey, string claimToken, CancellationToken cancellationToken = default) =>
        _repository.FailClaimAsync(idempotencyKey, claimToken, _dateTimeProvider.UtcNow, cancellationToken);

    public Task<bool> InterruptAsync(
        string idempotencyKey,
        string claimToken,
        string? assetType = null,
        int? assetId = null,
        CancellationToken cancellationToken = default) =>
        _repository.InterruptClaimAsync(
            idempotencyKey, claimToken, assetType, assetId, _dateTimeProvider.UtcNow, cancellationToken);

    public Task<AgentOperationLog?> FindAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.GetByIdempotencyKeyAsync(idempotencyKey, cancellationToken);

    public Task<IReadOnlyList<AgentOperationLog>> FindBatchAsync(string batchId, CancellationToken cancellationToken = default) =>
        _repository.GetByBatchIdAsync(batchId, cancellationToken);

    public Task<ReversalClaim> TryBeginReversalAsync(
        string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.TryBeginReversalAsync(
            idempotencyKey, AgentOperationLog.NewToken(), ReversalLease,
            _dateTimeProvider.UtcNow, cancellationToken);

    public Task<bool> CompleteReversalAsync(
        string idempotencyKey, string reversalToken, CancellationToken cancellationToken = default) =>
        _repository.CompleteReversalAsync(
            idempotencyKey, reversalToken, _dateTimeProvider.UtcNow, cancellationToken);

    public Task<bool> InterruptReversalAsync(
        string idempotencyKey, string reversalToken, CancellationToken cancellationToken = default) =>
        // One lease behind "now" and a minute more, so the claim is unambiguously outside
        // its own lease however the two clocks round.
        _repository.ExpireReversalClaimAsync(
            idempotencyKey,
            reversalToken,
            _dateTimeProvider.UtcNow.AddMinutes(-(ReversalLease + 1)),
            cancellationToken);

    public Task ReleaseReversalAsync(
        string idempotencyKey, string reversalToken, CancellationToken cancellationToken = default) =>
        _repository.ReleaseReversalAsync(idempotencyKey, reversalToken, cancellationToken);
}
