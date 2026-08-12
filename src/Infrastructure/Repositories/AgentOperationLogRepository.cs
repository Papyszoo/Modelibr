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
/// Completion, failure and takeover go through <c>ExecuteUpdate</c> so they touch only
/// the log row and never flush whatever the surrounding write staged.
///
/// Every state transition is expressed as a conditional UPDATE whose WHERE clause names
/// the state being left. That is what makes takeover of an abandoned claim safe under
/// concurrency: two callers can both decide a claim looks abandoned, but only one
/// UPDATE reports a matching row, and only that one proceeds.
/// </summary>
internal sealed class AgentOperationLogRepository : IAgentOperationLogRepository
{
    private readonly ApplicationDbContext _context;

    public AgentOperationLogRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<AgentOperationLog?> TryClaimAsync(
        AgentOperationLog claim,
        int leaseMinutes,
        DateTime now,
        CancellationToken cancellationToken = default)
    {
        _context.AgentOperationLogs.Add(claim);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
            return null;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Another caller claimed this key first - the unique index on
            // IdempotencyKey is what actually enforces "apply once", not the lookup.
            _context.Entry(claim).State = EntityState.Detached;
        }

        var existing = await GetByIdempotencyKeyAsync(claim.IdempotencyKey, cancellationToken);
        if (existing is null)
        {
            // Raced with a delete; let the caller retry rather than guess.
            return null;
        }

        if (existing.Status == AgentOperationStatus.Completed)
        {
            return existing;
        }

        // Failed, or Pending past its lease: take the claim over atomically. The WHERE
        // clause is the lock - a concurrent taker updates 0 rows and backs off.
        var abandonedBefore = now.AddMinutes(-leaseMinutes);
        var taken = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == claim.IdempotencyKey &&
                        (l.Status == AgentOperationStatus.Failed ||
                         (l.Status == AgentOperationStatus.Pending && l.ClaimedAt <= abandonedBefore)))
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Pending)
                    .SetProperty(l => l.ClaimedBy, claim.ClaimedBy)
                    .SetProperty(l => l.ClaimedAt, now)
                    .SetProperty(l => l.CompletedAt, (DateTime?)null)
                    .SetProperty(l => l.PerformedAt, now)
                    .SetProperty(l => l.Operation, claim.Operation)
                    .SetProperty(l => l.AssetType, claim.AssetType)
                    .SetProperty(l => l.AssetId, claim.AssetId)
                    .SetProperty(l => l.PayloadBefore, claim.PayloadBefore)
                    .SetProperty(l => l.PayloadAfter, (string?)null),
                cancellationToken);

        // 1 row: we now own it. 0 rows: the claim is genuinely in flight - report it.
        return taken == 1 ? null : existing;
    }

    public Task CompleteClaimAsync(
        string idempotencyKey,
        string? assetType,
        int? assetId,
        string? payloadAfter,
        DateTime completedAt,
        CancellationToken cancellationToken = default)
    {
        return _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Completed)
                    .SetProperty(l => l.CompletedAt, completedAt)
                    .SetProperty(l => l.AssetType, assetType)
                    .SetProperty(l => l.AssetId, assetId)
                    .SetProperty(l => l.PayloadAfter, payloadAfter),
                cancellationToken);
    }

    public Task FailClaimAsync(
        string idempotencyKey,
        DateTime failedAt,
        CancellationToken cancellationToken = default)
    {
        // Only a Pending claim may be failed - never downgrade a Completed operation.
        return _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey && l.Status == AgentOperationStatus.Pending)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Failed)
                    .SetProperty(l => l.CompletedAt, failedAt)
                    .SetProperty(l => l.ClaimedBy, (string?)null),
                cancellationToken);
    }

    public Task<AgentOperationLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default)
    {
        return _context.AgentOperationLogs
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.IdempotencyKey == idempotencyKey, cancellationToken);
    }
}
