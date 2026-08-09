using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;

namespace Application.Agents;

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
/// </summary>
public interface IAgentAudit
{
    /// <summary>
    /// Claims <paramref name="write"/>'s idempotency key. Returns <c>null</c> when the
    /// caller owns the claim and must go on to apply the write; returns the prior entry
    /// when the operation already ran (or is running) and must not be re-applied.
    /// </summary>
    Task<AgentOperationLog?> TryBeginAsync(AgentWrite write, CancellationToken cancellationToken = default);

    /// <summary>Records the outcome of a write that succeeded, on a claim this caller owns.</summary>
    Task CompleteAsync(
        string idempotencyKey,
        string? assetType = null,
        int? assetId = null,
        string? payloadAfter = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Releases a claim whose write failed, so retrying it is not turned away as
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
    private readonly IAgentOperationLogRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AgentAudit(
        IAgentOperationLogRepository repository,
        IDateTimeProvider dateTimeProvider)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
    }

    public Task<AgentOperationLog?> TryBeginAsync(AgentWrite write, CancellationToken cancellationToken = default)
    {
        var claim = AgentOperationLog.Create(
            write.IdempotencyKey,
            write.Operation,
            _dateTimeProvider.UtcNow,
            batchId: write.BatchId,
            assetType: write.AssetType,
            assetId: write.AssetId,
            payloadBefore: write.PayloadBefore,
            payloadAfter: write.PayloadAfter);

        return _repository.TryClaimAsync(claim, cancellationToken);
    }

    public Task CompleteAsync(
        string idempotencyKey,
        string? assetType = null,
        int? assetId = null,
        string? payloadAfter = null,
        CancellationToken cancellationToken = default) =>
        _repository.CompleteClaimAsync(idempotencyKey, assetType, assetId, payloadAfter, cancellationToken);

    public Task AbandonAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.ReleaseClaimAsync(idempotencyKey, cancellationToken);
}
