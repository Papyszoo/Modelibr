using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

/// <summary>
/// Ticket storage. <see cref="TryRedeemAsync"/> and the two settle methods are expressed as
/// conditional updates whose WHERE clause names the state being left, so concurrent callers
/// cannot both win a ticket - the same shape <c>AgentOperationLogRepository</c> uses for
/// idempotency claims.
/// </summary>
internal sealed class AgentUploadTicketRepository : IAgentUploadTicketRepository
{
    private readonly ApplicationDbContext _context;

    public AgentUploadTicketRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task AddAsync(AgentUploadTicket ticket, CancellationToken cancellationToken = default)
    {
        await _context.AgentUploadTickets.AddAsync(ticket, cancellationToken);
    }

    public async Task<AgentUploadTicket?> TryRedeemAsync(
        string secretHash,
        DateTime now,
        CancellationToken cancellationToken = default)
    {
        var redeemed = await _context.AgentUploadTickets
            .Where(t => t.SecretHash == secretHash &&
                        !t.IsSpent &&
                        t.RedeemedAt == null &&
                        t.ExpiresAt > now)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(t => t.RedeemedAt, now),
                cancellationToken);

        if (redeemed != 1)
        {
            return null;
        }

        // Re-read rather than trusting the pre-update snapshot: the row we just won is the
        // one the upload must be audited against, and ExecuteUpdate does not return it.
        return await _context.AgentUploadTickets
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.SecretHash == secretHash, cancellationToken);
    }

    public Task SpendAsync(int ticketId, int? assetId, CancellationToken cancellationToken = default)
    {
        return _context.AgentUploadTickets
            .Where(t => t.Id == ticketId)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(t => t.IsSpent, true)
                    .SetProperty(t => t.AssetId, assetId),
                cancellationToken);
    }

    public Task ReleaseAsync(int ticketId, CancellationToken cancellationToken = default)
    {
        // Only an unspent ticket may be handed back - releasing a spent one would let a
        // successful upload be replayed.
        return _context.AgentUploadTickets
            .Where(t => t.Id == ticketId && !t.IsSpent)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(t => t.RedeemedAt, (DateTime?)null),
                cancellationToken);
    }
}
