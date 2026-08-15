namespace Domain.Models;

/// <summary>
/// A single-use, expiring authorisation for one agent upload over the HTTP data plane.
///
/// Why this exists: an agent that is not co-located with the server cannot hand a write
/// tool a server-readable path, so the tool hands back HTTP endpoints and steps out. That
/// left the remote half of every import <b>unaudited and non-idempotent</b> - exactly the
/// two guarantees the co-located path advertises - because the upload arrived as an
/// ordinary anonymous multipart POST with nothing tying it to the agent or its key.
///
/// The ticket carries that context across the gap: it is bound to the idempotency key the
/// tool claimed, the operation, the asset family and the actor, so redeeming it lets the
/// upload endpoint apply the same claim-before-write guarantee the MCP path uses.
///
/// The secret is stored hashed and never read back - a leaked database gives an attacker
/// nothing to present, and a ticket is worth little in any case: one upload, one family,
/// minutes of validity.
/// </summary>
public class AgentUploadTicket
{
    /// <summary>
    /// How long a ticket stays redeemable. Long enough to stream a large model over a slow
    /// link, short enough that a ticket leaked into a log is worthless by the time anyone
    /// reads it.
    /// </summary>
    public const int LifetimeMinutes = 30;

    public int Id { get; private set; }

    /// <summary>SHA-256 of the ticket secret, hex-encoded. The secret itself is returned once, to the issuing tool, and never stored.</summary>
    public string SecretHash { get; private set; } = string.Empty;

    /// <summary>The idempotency key the redeemed upload is audited under.</summary>
    public string IdempotencyKey { get; private set; } = string.Empty;

    /// <summary>The operation the audit entry records, e.g. "import-model".</summary>
    public string Operation { get; private set; } = string.Empty;

    /// <summary>Asset family this ticket may create - a ticket for a sound cannot import a model.</summary>
    public string AssetType { get; private set; } = string.Empty;

    /// <summary>The access-token name that requested the ticket, carried through to the audit entry.</summary>
    public string? Actor { get; private set; }

    /// <summary>Batch the redeemed upload belongs to, so a remote import is reversible as one batch.</summary>
    public string? BatchId { get; private set; }

    public DateTime IssuedAt { get; private set; }
    public DateTime ExpiresAt { get; private set; }

    /// <summary>
    /// Set while an upload is redeeming this ticket, and permanently once one succeeded.
    /// Claim-shaped rather than a boolean flag: two concurrent uploads presenting the same
    /// ticket must not both proceed, and a failed upload must hand the ticket back.
    /// </summary>
    public DateTime? RedeemedAt { get; private set; }

    /// <summary>True once an upload completed against this ticket. A redeemed-but-failed ticket is reusable; this one is spent.</summary>
    public bool IsSpent { get; private set; }

    /// <summary>The asset the redeemed upload produced, when the endpoint reported one.</summary>
    public int? AssetId { get; private set; }

    public static AgentUploadTicket Create(
        string secretHash,
        string idempotencyKey,
        string operation,
        string assetType,
        DateTime issuedAt,
        DateTime expiresAt,
        string? actor = null,
        string? batchId = null)
    {
        if (string.IsNullOrWhiteSpace(secretHash))
            throw new ArgumentException("Secret hash cannot be null or whitespace.", nameof(secretHash));
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new ArgumentException("Idempotency key cannot be null or whitespace.", nameof(idempotencyKey));
        if (string.IsNullOrWhiteSpace(operation))
            throw new ArgumentException("Operation cannot be null or whitespace.", nameof(operation));
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or whitespace.", nameof(assetType));
        if (expiresAt <= issuedAt)
            throw new ArgumentException("A ticket must expire after it is issued.", nameof(expiresAt));

        return new AgentUploadTicket
        {
            SecretHash = secretHash,
            IdempotencyKey = idempotencyKey.Trim(),
            Operation = operation.Trim(),
            AssetType = assetType.Trim(),
            Actor = string.IsNullOrWhiteSpace(actor) ? null : actor.Trim(),
            BatchId = string.IsNullOrWhiteSpace(batchId) ? null : batchId.Trim(),
            IssuedAt = issuedAt,
            ExpiresAt = expiresAt
        };
    }

    /// <summary>True when this ticket may still be handed to an upload.</summary>
    public bool IsRedeemable(DateTime now) => !IsSpent && RedeemedAt is null && now < ExpiresAt;

    /// <summary>Takes the ticket for an upload that is about to run.</summary>
    public void Redeem(DateTime now) => RedeemedAt = now;

    /// <summary>Records that the upload landed. The ticket is now spent and cannot be reused.</summary>
    public void Spend(int? assetId)
    {
        IsSpent = true;
        AssetId = assetId;
    }

    /// <summary>
    /// Hands the ticket back after an upload that did not land, so the agent can fix its
    /// request and retry rather than having to ask for a new ticket for a write that never
    /// happened. Expiry still applies.
    /// </summary>
    public void Release() => RedeemedAt = null;
}
