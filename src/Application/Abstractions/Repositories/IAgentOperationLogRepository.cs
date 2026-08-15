using Domain.Models;

namespace Application.Abstractions.Repositories;

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
    /// Reserves <paramref name="claim"/>'s idempotency key. Returns <c>null</c> when the
    /// caller now owns the claim and must apply its write; otherwise the entry that holds
    /// the key, whose <see cref="AgentOperationLog.Status"/> tells the caller whether the
    /// operation already completed or is still in flight.
    ///
    /// A claim left <c>Pending</c> for longer than <paramref name="leaseMinutes"/> is
    /// treated as abandoned (its owner crashed between claiming and mutating) and is
    /// taken over atomically, so one dead caller cannot wedge a key forever.
    /// </summary>
    Task<AgentOperationLog?> TryClaimAsync(
        AgentOperationLog claim,
        int leaseMinutes,
        DateTime now,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an owned claim Completed - the only state a retry may replay as applied.
    /// A null <paramref name="payloadBefore"/> leaves whatever the claim already recorded,
    /// so a caller that captured the prior state at claim time does not lose it here.
    /// </summary>
    Task CompleteClaimAsync(
        string idempotencyKey,
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
    Task FailClaimAsync(
        string idempotencyKey,
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
    /// Stamps <see cref="AgentOperationLog.ReversedAt"/> on an entry whose inverse has been
    /// applied. Only an un-reversed Completed entry is affected, so a repeated
    /// <c>reverse_operation</c> call cannot undo the same write twice.
    /// </summary>
    /// <returns>True when this call is the one that marked it reversed.</returns>
    Task<bool> TryMarkReversedAsync(
        string idempotencyKey,
        DateTime reversedAt,
        CancellationToken cancellationToken = default);
}
