using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Append-only audit of agent-initiated writes (MCP write tools). Idempotency is
/// enforced by <b>claiming</b> the caller-supplied key before a write is applied — a
/// lookup-then-write check is not enough, because two concurrent calls carrying the
/// same key both pass the lookup and both apply the write.
/// </summary>
public interface IAgentOperationLogRepository
{
    /// <summary>
    /// Reserves <paramref name="claim"/>'s idempotency key by inserting it immediately.
    /// Returns <c>null</c> when the key was free (the caller owns the claim and may apply
    /// its write), or the entry that already holds the key (the caller must not re-apply).
    /// </summary>
    Task<AgentOperationLog?> TryClaimAsync(AgentOperationLog claim, CancellationToken cancellationToken = default);

    /// <summary>Fills in the outcome of a write that succeeded, on an owned claim.</summary>
    Task CompleteClaimAsync(
        string idempotencyKey,
        string? assetType,
        int? assetId,
        string? payloadAfter,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Releases an owned claim whose write failed, so a genuine retry is not turned away
    /// as "already applied" for an operation that never happened.
    /// </summary>
    Task ReleaseClaimAsync(string idempotencyKey, CancellationToken cancellationToken = default);

    /// <summary>The entry for an idempotency key, if the operation already ran.</summary>
    Task<AgentOperationLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default);
}
