namespace Application.Abstractions.Services;

/// <summary>A freshly issued ticket. The secret is visible exactly once, here.</summary>
public sealed record AgentUploadTicketGrant(
    string Secret,
    string IdempotencyKey,
    DateTime ExpiresAt);

/// <summary>The context a redeemed ticket restores, so the upload can be audited as the agent write it is.</summary>
public sealed record RedeemedUploadTicket(
    int TicketId,
    string IdempotencyKey,
    string Operation,
    string AssetType,
    string? Actor,
    string? BatchId);

/// <summary>
/// Issues and redeems the single-use tickets that make a remote agent's HTTP upload as
/// audited and idempotent as a co-located one.
/// </summary>
public interface IAgentUploadTickets
{
    /// <summary>
    /// Issues a ticket bound to <paramref name="idempotencyKey"/>. The key is <b>not</b>
    /// claimed here - a claim is taken when the upload actually arrives, so an agent that
    /// asks for a ticket and never uses it has not burned its key.
    /// </summary>
    Task<AgentUploadTicketGrant> IssueAsync(
        string idempotencyKey,
        string operation,
        string assetType,
        string? actor = null,
        string? batchId = null,
        CancellationToken cancellationToken = default);

    /// <summary>Takes a ticket for an upload that is about to run, or null when the secret buys nothing.</summary>
    Task<RedeemedUploadTicket?> TryRedeemAsync(string presentedSecret, CancellationToken cancellationToken = default);

    /// <summary>
    /// Settles a redeemed ticket: spent when the upload landed, returned to the pool when
    /// it did not, so a rejected request can be fixed and retried on the same ticket.
    /// </summary>
    Task SettleAsync(int ticketId, bool succeeded, int? assetId = null, CancellationToken cancellationToken = default);
}
