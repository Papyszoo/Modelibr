using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Append-only audit of agent-initiated writes (MCP write tools). Idempotency is
/// enforced by looking up a prior entry with the same caller-supplied key before a
/// write is applied.
/// </summary>
public interface IAgentOperationLogRepository
{
    Task AddAsync(AgentOperationLog log, CancellationToken cancellationToken = default);

    /// <summary>The prior entry for an idempotency key, if the operation already ran.</summary>
    Task<AgentOperationLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default);
}
