using Application.Abstractions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;

namespace Application.Agents;

/// <summary>
/// Records agent-initiated writes (MCP write tools) into the append-only
/// <see cref="AgentOperationLog"/> and enforces idempotency: a repeated write carrying
/// the same key is detected up-front so it is not re-applied. This is the audit + replay
/// safety the write surface requires (prompt 30 / [[project_mcp_full_agent_surface_v06]]).
/// </summary>
public interface IAgentAudit
{
    /// <summary>The prior log entry for this key, or null if the operation has not run.</summary>
    Task<AgentOperationLog?> FindAsync(string idempotencyKey, CancellationToken cancellationToken = default);

    /// <summary>Appends an audit entry and commits it (separate from the write's own commit).</summary>
    Task RecordAsync(AgentWrite write, CancellationToken cancellationToken = default);
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
    private readonly IUnitOfWork _unitOfWork;

    public AgentAudit(
        IAgentOperationLogRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public Task<AgentOperationLog?> FindAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _repository.GetByIdempotencyKeyAsync(idempotencyKey, cancellationToken);

    public async Task RecordAsync(AgentWrite write, CancellationToken cancellationToken = default)
    {
        var log = AgentOperationLog.Create(
            write.IdempotencyKey,
            write.Operation,
            _dateTimeProvider.UtcNow,
            batchId: write.BatchId,
            assetType: write.AssetType,
            assetId: write.AssetId,
            payloadBefore: write.PayloadBefore,
            payloadAfter: write.PayloadAfter);

        await _repository.AddAsync(log, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
