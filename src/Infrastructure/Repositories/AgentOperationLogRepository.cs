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
///
/// Two of those WHERE clauses also name a <b>token</b>, which is the other half of the
/// same idea. Naming only the state leaves a settle open to a caller that held the claim
/// a generation ago: it wakes up late, writes "Completed" by key, and stamps its outcome
/// onto somebody else's in-flight work. The token is the generation, so a stale owner's
/// UPDATE matches nothing and the caller is told it lost.
/// </summary>
internal sealed class AgentOperationLogRepository : IAgentOperationLogRepository
{
    private readonly ApplicationDbContext _context;

    public AgentOperationLogRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<ClaimTakeover> TryClaimAsync(
        AgentOperationLog claim,
        int leaseMinutes,
        DateTime now,
        CancellationToken cancellationToken = default)
    {
        _context.AgentOperationLogs.Add(claim);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
            return new ClaimTakeover(Owned: true, ClaimToken: claim.ClaimToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _context.Entry(claim).State = EntityState.Detached;
        }

        var existing = await _context.AgentOperationLogs
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.IdempotencyKey == claim.IdempotencyKey, cancellationToken);

        if (existing is null)
        {
            // Raced with a delete; let the caller retry rather than guess.
            return new ClaimTakeover(Owned: true, ClaimToken: claim.ClaimToken);
        }

        if (existing.Status == AgentOperationStatus.Completed)
        {
            return new ClaimTakeover(Owned: false, Existing: existing);
        }

        // Terminal, and checked before anything else: whether this key's mutation landed is
        // not recorded, and no number of retries will make it recorded. Every attempt gets
        // the same answer, which is what stops the second press of the button being the one
        // that quietly makes two packs.
        if (existing.Status == AgentOperationStatus.Interrupted)
        {
            return new ClaimTakeover(Owned: false, Existing: existing, Interrupted: true);
        }

        // A Failed claim was released on a path that reported its own outcome, so taking
        // it over is what a retry means. Done first and on its own so it never gets
        // confused with the case below.
        var taken = await TakeOverAsync(
            claim, now, l => l.Status == AgentOperationStatus.Failed, cancellationToken);
        if (taken == 1)
        {
            return new ClaimTakeover(Owned: true, ClaimToken: claim.ClaimToken);
        }

        // A Pending claim past its lease is the one that must NOT be taken over: its owner
        // died somewhere between claiming and completing, and the mutation may well have
        // committed in between. Move it to Interrupted - a state that outlives this call -
        // and report it. The key is not wedged Pending forever, but neither does it decay
        // into something a later retry re-runs.
        var abandonedBefore = now.AddMinutes(-leaseMinutes);
        var interrupted = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == claim.IdempotencyKey &&
                        l.Status == AgentOperationStatus.Pending &&
                        l.ClaimedAt <= abandonedBefore)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Interrupted)
                    .SetProperty(l => l.CompletedAt, now)
                    .SetProperty(l => l.ClaimedBy, (string?)null),
                cancellationToken);

        if (interrupted == 1)
        {
            return new ClaimTakeover(Owned: false, Existing: existing, Interrupted: true);
        }

        // The claim is genuinely in flight - report it.
        return new ClaimTakeover(Owned: false, Existing: existing);
    }

    /// <summary>
    /// Re-points an existing log row at this caller's claim, if it is in the state
    /// <paramref name="state"/> names. The WHERE clause is the lock: a concurrent taker
    /// updates 0 rows and backs off.
    /// </summary>
    private Task<int> TakeOverAsync(
        AgentOperationLog claim,
        DateTime now,
        System.Linq.Expressions.Expression<Func<AgentOperationLog, bool>> state,
        CancellationToken cancellationToken)
    {
        var key = claim.IdempotencyKey;
        return _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == key)
            .Where(state)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Pending)
                    .SetProperty(l => l.ClaimedBy, claim.ClaimedBy)
                    // A fresh generation, so the previous owner cannot settle what it lost.
                    .SetProperty(l => l.ClaimToken, claim.ClaimToken)
                    .SetProperty(l => l.Actor, claim.Actor)
                    .SetProperty(l => l.ClaimedAt, now)
                    .SetProperty(l => l.CompletedAt, (DateTime?)null)
                    .SetProperty(l => l.Operation, claim.Operation)
                    .SetProperty(l => l.BatchId, claim.BatchId)
                    .SetProperty(l => l.PerformedAt, claim.PerformedAt)
                    .SetProperty(l => l.AssetType, claim.AssetType)
                    .SetProperty(l => l.AssetId, claim.AssetId)
                    .SetProperty(l => l.PayloadBefore, claim.PayloadBefore)
                    .SetProperty(l => l.PayloadAfter, (string?)null),
                cancellationToken);
    }

    public async Task<bool> CompleteClaimAsync(
        string idempotencyKey,
        string claimToken,
        string? assetType,
        int? assetId,
        string? payloadAfter,
        string? payloadBefore,
        DateTime completedAt,
        CancellationToken cancellationToken = default)
    {
        // Status AND token: only the caller that currently holds this generation of the
        // claim may declare it applied.
        var completed = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey &&
                        l.ClaimToken == claimToken &&
                        l.Status == AgentOperationStatus.Pending)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Completed)
                    .SetProperty(l => l.CompletedAt, completedAt)
                    .SetProperty(l => l.AssetType, assetType)
                    .SetProperty(l => l.AssetId, assetId)
                    .SetProperty(l => l.PayloadAfter, payloadAfter)
                    // Coalesce, not overwrite: most tools capture the prior state inside the
                    // guarded body and pass it here, but a caller that already recorded it at
                    // claim time must not have it erased by this update.
                    .SetProperty(l => l.PayloadBefore, l => payloadBefore ?? l.PayloadBefore),
                cancellationToken);

        return completed == 1;
    }

    public async Task<bool> FailClaimAsync(
        string idempotencyKey,
        string claimToken,
        DateTime failedAt,
        CancellationToken cancellationToken = default)
    {
        // Only a Pending claim this caller still owns may be failed - never downgrade a
        // Completed operation, and never release somebody else's in-flight claim.
        var failed = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey &&
                        l.ClaimToken == claimToken &&
                        l.Status == AgentOperationStatus.Pending)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Failed)
                    .SetProperty(l => l.CompletedAt, failedAt)
                    .SetProperty(l => l.ClaimedBy, (string?)null),
                cancellationToken);

        return failed == 1;
    }

    public async Task<bool> InterruptClaimAsync(
        string idempotencyKey,
        string claimToken,
        string? assetType,
        int? assetId,
        DateTime noticedAt,
        CancellationToken cancellationToken = default)
    {
        // Same ownership rule as failing a claim - Pending, and this generation of it - but
        // the state it lands in is terminal rather than retryable. The caller reaches here
        // when it cannot say whether the mutation committed, and a key nobody can answer for
        // must not be handed to the next retry.
        var interrupted = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey &&
                        l.ClaimToken == claimToken &&
                        l.Status == AgentOperationStatus.Pending)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.Status, AgentOperationStatus.Interrupted)
                    .SetProperty(l => l.CompletedAt, noticedAt)
                    .SetProperty(l => l.ClaimedBy, (string?)null)
                    // Coalesced, so an interrupt that knows what it was working on records it
                    // and one that does not leaves the claim-time value alone. This is what
                    // the recovery answer points a person at.
                    .SetProperty(l => l.AssetType, l => assetType ?? l.AssetType)
                    .SetProperty(l => l.AssetId, l => assetId ?? l.AssetId),
                cancellationToken);

        return interrupted == 1;
    }

    public Task<AgentOperationLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default)
    {
        return _context.AgentOperationLogs
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.IdempotencyKey == idempotencyKey, cancellationToken);
    }

    public async Task<IReadOnlyList<AgentOperationLog>> GetByBatchIdAsync(
        string batchId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AgentOperationLogs
            .AsNoTracking()
            .Where(l => l.BatchId == batchId)
            .OrderBy(l => l.Id)
            .ToListAsync(cancellationToken);
    }

    public async Task<ReversalClaim> TryBeginReversalAsync(
        string idempotencyKey,
        string reversalToken,
        int leaseMinutes,
        DateTime now,
        CancellationToken cancellationToken = default)
    {
        // The claim itself: one conditional UPDATE, free of any read-then-write window.
        // ReversalToken == null is the lock, and it is a lock only - it says nothing about
        // whether an inverse ran, which is exactly the property ReversedAt could not have
        // while it was doing both jobs.
        var claimed = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey &&
                        l.Status == AgentOperationStatus.Completed &&
                        l.ReversedAt == null &&
                        l.ReversalToken == null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.ReversalToken, reversalToken)
                    .SetProperty(l => l.ReversalClaimedAt, (DateTime?)now),
                cancellationToken);

        if (claimed == 1)
        {
            return new ReversalClaim(ReversalClaimOutcome.Claimed, reversalToken);
        }

        // Lost, already done, or never reversible - read the row to say which.
        var entry = await _context.AgentOperationLogs
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.IdempotencyKey == idempotencyKey, cancellationToken);

        if (entry is null || entry.Status != AgentOperationStatus.Completed)
        {
            return new ReversalClaim(ReversalClaimOutcome.NotReversible);
        }

        if (entry.ReversedAt is not null)
        {
            return new ReversalClaim(ReversalClaimOutcome.AlreadyReversed);
        }

        // Somebody holds the claim. Whether they are alive decides which of the two
        // unhappy answers this is - and neither of them retakes it, because an inverse
        // that half-ran is not a lock to steal.
        return entry.IsReversalAbandoned(now, leaseMinutes)
            ? new ReversalClaim(ReversalClaimOutcome.Interrupted)
            : new ReversalClaim(ReversalClaimOutcome.InProgress);
    }

    public async Task<bool> CompleteReversalAsync(
        string idempotencyKey,
        string reversalToken,
        DateTime reversedAt,
        CancellationToken cancellationToken = default)
    {
        // The permanent marker, written only here and only by the caller that still holds
        // the claim it was handed.
        var marked = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey &&
                        l.ReversalToken == reversalToken &&
                        l.ReversedAt == null)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(l => l.ReversedAt, (DateTime?)reversedAt),
                cancellationToken);

        return marked == 1;
    }

    public async Task<bool> ExpireReversalClaimAsync(
        string idempotencyKey,
        string reversalToken,
        DateTime expiredAt,
        CancellationToken cancellationToken = default)
    {
        // The token stays: the claim is held, not given back. Only its clock is moved, so
        // the next attempt reads the entry as an inverse whose outcome nobody recorded and
        // reports it instead of applying it again. ReversedAt is untouched, because nothing
        // here knows whether anything was reversed - that is the entire point.
        var expired = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey &&
                        l.ReversalToken == reversalToken &&
                        l.ReversedAt == null)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(l => l.ReversalClaimedAt, (DateTime?)expiredAt),
                cancellationToken);

        return expired == 1;
    }

    public async Task<bool> ReleaseReversalAsync(
        string idempotencyKey,
        string reversalToken,
        CancellationToken cancellationToken = default)
    {
        // Gives back a claim this caller owns, and only that. ReversedAt is untouched:
        // nothing was reversed, so nothing may say it was.
        var released = await _context.AgentOperationLogs
            .Where(l => l.IdempotencyKey == idempotencyKey &&
                        l.ReversalToken == reversalToken &&
                        l.ReversedAt == null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(l => l.ReversalToken, (string?)null)
                    .SetProperty(l => l.ReversalClaimedAt, (DateTime?)null),
                cancellationToken);

        return released == 1;
    }
}
