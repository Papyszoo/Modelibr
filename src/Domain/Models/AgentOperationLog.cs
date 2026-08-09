namespace Domain.Models;

/// <summary>
/// Append-only audit of agent-initiated writes (schema hook — no write endpoints
/// exist yet). Detailed enough to review and reverse a batch: an agent that
/// mis-assigns forty texture channels must be undoable in one action, so each
/// entry carries the before/after payload, an idempotency key (so a retried write
/// is a no-op), and an optional batch id grouping one logical operation.
/// </summary>
public class AgentOperationLog
{
    public int Id { get; private set; }

    /// <summary>Caller-supplied idempotency key — a repeated write with the same key must not re-apply.</summary>
    public string IdempotencyKey { get; private set; } = string.Empty;

    /// <summary>Groups entries that belong to one batch, so the whole batch can be reversed together. Null for singletons.</summary>
    public string? BatchId { get; private set; }

    /// <summary>The operation performed, e.g. "assign-texture-channel".</summary>
    public string Operation { get; private set; } = string.Empty;

    /// <summary>Target asset, when the operation targets one.</summary>
    public string? AssetType { get; private set; }
    public int? AssetId { get; private set; }

    /// <summary>State before/after as JSON (stored as jsonb) — the basis for review and reversal.</summary>
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
        string? payloadAfter = null)
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
}
