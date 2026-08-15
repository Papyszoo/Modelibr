namespace Domain.Models;

/// <summary>
/// Lifecycle of an idempotency claim. The claim is written <b>before</b> the mutation it
/// guards, so "a row exists" cannot mean "the operation happened" - only
/// <see cref="Completed"/> does.
/// </summary>
public static class AgentOperationStatus
{
    /// <summary>Claimed; the mutation is in flight (or its caller died mid-flight).</summary>
    public const string Pending = "Pending";

    /// <summary>The mutation was applied. A retry with this key must replay the result.</summary>
    public const string Completed = "Completed";

    /// <summary>The mutation did not happen. A retry with this key may take the claim over.</summary>
    public const string Failed = "Failed";
}

/// <summary>
/// Append-only audit of agent-initiated writes (schema hook - no write endpoints
/// exist yet). Detailed enough to review and reverse a batch: an agent that
/// mis-assigns forty texture channels must be undoable in one action, so each
/// entry carries the before/after payload, an idempotency key (so a retried write
/// is a no-op), and an optional batch id grouping one logical operation.
/// </summary>
public class AgentOperationLog
{
    public int Id { get; private set; }

    /// <summary>Caller-supplied idempotency key - a repeated write with the same key must not re-apply.</summary>
    public string IdempotencyKey { get; private set; } = string.Empty;

    /// <summary>Groups entries that belong to one batch, so the whole batch can be reversed together. Null for singletons.</summary>
    public string? BatchId { get; private set; }

    /// <summary>
    /// Pending / Completed / Failed (see <see cref="AgentOperationStatus"/>). A row is
    /// written before its mutation runs, so only Completed proves the write landed -
    /// treating any existing row as "already applied" answered a retry with success for
    /// an operation that had crashed halfway or was still running.
    /// </summary>
    public string Status { get; private set; } = AgentOperationStatus.Pending;

    /// <summary>
    /// Who holds the Pending claim, so an owner can tell its own in-flight work from a
    /// concurrent caller's, and an abandoned claim can be identified.
    /// </summary>
    public string? ClaimedBy { get; private set; }

    /// <summary>
    /// Which agent identity performed this write - the name of the access token it
    /// presented, or null when the server runs unauthenticated (the local-first default).
    /// <see cref="ClaimedBy"/> records the machine that holds the claim; this records
    /// <b>who asked</b>, which is the question an audit reviewing a bad batch is asking.
    /// </summary>
    public string? Actor { get; private set; }

    /// <summary>When the claim was taken. A Pending claim older than the lease is abandoned.</summary>
    public DateTime ClaimedAt { get; private set; }

    /// <summary>When the mutation finished (Completed or Failed).</summary>
    public DateTime? CompletedAt { get; private set; }

    /// <summary>The operation performed, e.g. "assign-texture-channel".</summary>
    public string Operation { get; private set; } = string.Empty;

    /// <summary>Target asset, when the operation targets one.</summary>
    public string? AssetType { get; private set; }
    public int? AssetId { get; private set; }

    /// <summary>State before/after as JSON (stored as jsonb) - the basis for review and reversal.</summary>
    public string? PayloadBefore { get; private set; }
    public string? PayloadAfter { get; private set; }

    public DateTime PerformedAt { get; private set; }

    /// <summary>Set when the operation has been reversed; null while it still stands.</summary>
    public DateTime? ReversedAt { get; private set; }

    public static AgentOperationLog Create(
        string idempotencyKey,
        string operation,
        DateTime performedAt,
        string? batchId = null,
        string? assetType = null,
        int? assetId = null,
        string? payloadBefore = null,
        string? payloadAfter = null,
        string? claimedBy = null,
        string? actor = null)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new ArgumentException("Idempotency key cannot be null or whitespace.", nameof(idempotencyKey));
        if (string.IsNullOrWhiteSpace(operation))
            throw new ArgumentException("Operation cannot be null or whitespace.", nameof(operation));
        if (assetId.HasValue && assetId.Value <= 0)
            throw new ArgumentException("Asset id must be greater than 0 when provided.", nameof(assetId));

        return new AgentOperationLog
        {
            IdempotencyKey = idempotencyKey.Trim(),
            Operation = operation.Trim(),
            PerformedAt = performedAt,
            Status = AgentOperationStatus.Pending,
            ClaimedBy = string.IsNullOrWhiteSpace(claimedBy) ? null : claimedBy.Trim(),
            Actor = string.IsNullOrWhiteSpace(actor) ? null : actor.Trim(),
            ClaimedAt = performedAt,
            BatchId = string.IsNullOrWhiteSpace(batchId) ? null : batchId.Trim(),
            AssetType = string.IsNullOrWhiteSpace(assetType) ? null : assetType.Trim(),
            AssetId = assetId,
            PayloadBefore = payloadBefore,
            PayloadAfter = payloadAfter
        };
    }

    /// <summary>Marks this entry reversed (the undo path that makes agent writes safe).</summary>
    public void MarkReversed(DateTime reversedAt)
    {
        ReversedAt = reversedAt;
    }

    /// <summary>Records that the guarded mutation landed. Only now may a retry replay it.</summary>
    public void MarkCompleted(DateTime completedAt, string? assetType, int? assetId, string? payloadAfter)
    {
        Status = AgentOperationStatus.Completed;
        CompletedAt = completedAt;
        AssetType = string.IsNullOrWhiteSpace(assetType) ? AssetType : assetType.Trim();
        AssetId = assetId ?? AssetId;
        PayloadAfter = payloadAfter ?? PayloadAfter;
    }

    /// <summary>Records that the guarded mutation did not happen, freeing the key for a retry.</summary>
    public void MarkFailed(DateTime failedAt)
    {
        Status = AgentOperationStatus.Failed;
        CompletedAt = failedAt;
        ClaimedBy = null;
    }

    /// <summary>
    /// Hands a stale Pending claim to a new caller. Used when the previous owner died
    /// between claiming and mutating, which otherwise wedged the key forever.
    /// </summary>
    public void Reclaim(string? claimedBy, DateTime claimedAt, string? actor = null)
    {
        Status = AgentOperationStatus.Pending;
        ClaimedBy = string.IsNullOrWhiteSpace(claimedBy) ? null : claimedBy.Trim();
        // The new owner is the one accountable for what lands, so attribution follows the
        // claim. An older actor's name on a write it never performed would be a lie.
        Actor = string.IsNullOrWhiteSpace(actor) ? null : actor.Trim();
        ClaimedAt = claimedAt;
        CompletedAt = null;
    }

    /// <summary>True when a Pending claim has outlived <paramref name="leaseMinutes"/>.</summary>
    public bool IsClaimAbandoned(DateTime now, int leaseMinutes) =>
        Status == AgentOperationStatus.Pending && now >= ClaimedAt.AddMinutes(leaseMinutes);
}
