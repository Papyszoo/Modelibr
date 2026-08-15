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
    InProgress
}

/// <summary>Outcome of <see cref="IAgentAudit.TryBeginAsync"/>, with the entry when there is one.</summary>
public sealed record AgentClaim(AgentClaimOutcome Outcome, AgentOperationLog? Entry)
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
/// Pending claim is reported as in-progress (retryable), and a claim whose owner died is
/// reclaimed after its lease so a crash cannot permanently burn an idempotency key.
/// </summary>
public interface IAgentAudit
{
    /// <summary>Claims <paramref name="write"/>'s key, reporting who owns it and in what state.</summary>
    Task<AgentClaim> TryBeginAsync(AgentWrite write, CancellationToken cancellationToken = default);

    /// <summary>
    /// Records the outcome of a write that succeeded, on a claim this caller owns.
    ///
    /// <paramref name="payloadBefore"/> is accepted here, not only at claim time, because
    /// the state a write replaces is usually read <i>inside</i> the guarded body - after
    /// the claim. Without it the undo path has nothing to restore. Passing null leaves any
    /// claim-time value intact rather than erasing it.
    /// </summary>
    Task CompleteAsync(
        string idempotencyKey,
        string? assetType = null,
        int? assetId = null,
        string? payloadAfter = null,
        string? payloadBefore = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an owned claim as failed, so retrying it is not turned away as
    /// "already applied" for an operation that never happened.
    /// </summary>
    Task AbandonAsync(string idempotencyKey, CancellationToken cancellationToken = default);

    /// <summary>The recorded entry for one idempotency key, or null if never claimed.</summary>
    Task<AgentOperationLog?> FindAsync(string idempotencyKey, CancellationToken cancellationToken = default);

    /// <summary>Every entry recorded under one batch id, oldest first.</summary>
    Task<IReadOnlyList<AgentOperationLog>> FindBatchAsync(string batchId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an entry reversed once its inverse has been applied. Returns false when the
    /// entry was already reversed - which is what stops a repeated undo from applying an
    /// inverse twice.
    /// </summary>
    Task<bool> TryMarkReversedAsync(string idempotencyKey, CancellationToken cancellationToken = default);
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

        var existing = await _repository.TryClaimAsync(claim, ClaimLeaseMinutes, now, cancellationToken);
        if (existing is null)
        {
            return new AgentClaim(AgentClaimOutcome.Owned, null);
        }

        return existing.Status == AgentOperationStatus.Completed
            ? new AgentClaim(AgentClaimOutcome.AlreadyApplied, existing)
            : new AgentClaim(AgentClaimOutcome.InProgress, existing);
    }

    public Task CompleteAsync(
        string idempotencyKey,
        string? assetType = null,
        int? assetId = null,
        string? payloadAfter = null,
        string? payloadBefore = null,
        CancellationToken cancellationToken = default) =>
        _repository.CompleteClaimAsync(
            idempotencyKey, assetType, assetId, payloadAfter, payloadBefore, _dateTimeProvider.UtcNow, cancellationToken);

    public Task AbandonAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.FailClaimAsync(idempotencyKey, _dateTimeProvider.UtcNow, cancellationToken);

    public Task<AgentOperationLog?> FindAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.GetByIdempotencyKeyAsync(idempotencyKey, cancellationToken);

    public Task<IReadOnlyList<AgentOperationLog>> FindBatchAsync(string batchId, CancellationToken cancellationToken = default) =>
        _repository.GetByBatchIdAsync(batchId, cancellationToken);

    public Task<bool> TryMarkReversedAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.TryMarkReversedAsync(idempotencyKey, _dateTimeProvider.UtcNow, cancellationToken);
}
