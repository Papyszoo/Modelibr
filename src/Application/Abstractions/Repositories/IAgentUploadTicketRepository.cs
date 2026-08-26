using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Storage for the single-use upload tickets that carry an agent's identity and
/// idempotency key across to the HTTP data plane.
///
/// Redemption is a conditional UPDATE rather than a read-then-write, for the same reason
/// the idempotency claim is: two uploads presenting one ticket at the same moment must not
/// both be told they own it.
/// </summary>
public interface IAgentUploadTicketRepository
{
    /// <summary>Stages a newly issued ticket. The caller commits.</summary>
    Task AddAsync(AgentUploadTicket ticket, CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically takes an unspent, unexpired, unredeemed ticket by its hashed secret.
    /// Returns the ticket when this caller won it, null when the secret matches nothing
    /// redeemable (unknown, expired, in flight, or already spent).
    /// </summary>
    Task<AgentUploadTicket?> TryRedeemAsync(string secretHash, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>Marks a redeemed ticket spent, recording the asset the upload produced.</summary>
    Task SpendAsync(int ticketId, int? assetId, CancellationToken cancellationToken = default);

    /// <summary>Returns a redeemed ticket to the pool after an upload that did not land.</summary>
    Task ReleaseAsync(int ticketId, CancellationToken cancellationToken = default);
}
