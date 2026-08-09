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
/// index while its mutation has already landed — which is exactly how a batch import
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

    /// <summary>Records the outcome of a write that succeeded, on a claim this caller owns.</summary>
    Task CompleteAsync(
        string idempotencyKey,
        string? assetType = null,
        int? assetId = null,
        string? payloadAfter = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an owned claim as failed, so retrying it is not turned away as
    /// "already applied" for an operation that never happened.
    /// </summary>
    Task AbandonAsync(string idempotencyKey, CancellationToken cancellationToken = default);
}

/// <summary>Describes one agent write for the audit log.</summary>
public sealed record AgentWrite(
    string IdempotencyKey,
    string Operation,
    string? AssetType = null,
    int? AssetId = null,
    string? PayloadBefore = null,
    string? PayloadAfter = null,
    string? BatchId = null);

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
            claimedBy: Environment.MachineName);

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
        CancellationToken cancellationToken = default) =>
        _repository.CompleteClaimAsync(
            idempotencyKey, assetType, assetId, payloadAfter, _dateTimeProvider.UtcNow, cancellationToken);

    public Task AbandonAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.FailClaimAsync(idempotencyKey, _dateTimeProvider.UtcNow, cancellationToken);
}
