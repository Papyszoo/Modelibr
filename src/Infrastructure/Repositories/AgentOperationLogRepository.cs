using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Infrastructure.Repositories;

/// <summary>
/// Claim-based idempotency store for agent writes.
///
/// These methods stay self-committing on purpose (see
/// <c>RepositoriesDontSelfCommitTests</c>' allowlist): the claim is an
/// idempotent-insert primitive that must hit the database <i>before</i> the write it
/// guards, so it can catch its own unique violation and report the winning entry.
/// Completion and release go through <c>ExecuteUpdate</c>/<c>ExecuteDelete</c> so they
/// touch only the log row and never flush whatever the surrounding write staged.
/// </summary>
internal sealed class AgentOperationLogRepository : IAgentOperationLogRepository
{
    private readonly ApplicationDbContext _context;

    public AgentOperationLogRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<AgentOperationLog?> TryClaimAsync(AgentOperationLog claim, CancellationToken cancellationToken = default)
    {
        _context.AgentOperationLogs.Add(claim);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
            return null;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Another caller claimed this key first — the unique index on
            // IdempotencyKey is what actually enforces "apply once", not the lookup.
            _context.Entry(claim).State = EntityState.Detached;
            return await GetByIdempotencyKeyAsync(claim.IdempotencyKey, cancellationToken);
        }
    }

    public Task CompleteClaimAsync(
        string idempotencyKey,
        string? assetType,
        int? assetId,
        string? payloadAfter,
        CancellationToken cancellationToken = default)
    {
        return _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.AssetType, assetType)
                    .SetProperty(l => l.AssetId, assetId)
                    .SetProperty(l => l.PayloadAfter, payloadAfter),
                cancellationToken);
    }

    public Task ReleaseClaimAsync(string idempotencyKey, CancellationToken cancellationToken = default)
    {
        return _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey)
            .ExecuteDeleteAsync(cancellationToken);
    }

    public Task<AgentOperationLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default)
    {
        return _context.AgentOperationLogs
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.IdempotencyKey == idempotencyKey, cancellationToken);
    }
}
