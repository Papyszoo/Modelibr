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

    /// <summary>
    /// The claim's owner disappeared between claiming the key and settling it, and nothing
    /// recorded whether its mutation committed first.
    ///
    /// <para>
    /// This is <b>not</b> <see cref="Failed"/>, and the difference is the point. Failed is
    /// written by a path that knows the mutation did not happen - a returned error, a thrown
    /// exception, a cancellation - so retrying it is exactly what a retry is for. Interrupted
    /// is written by the lease sweep, which knows nothing: the mutation commits before the
    /// entry is marked Completed, so a claim still Pending when its owner died may have
    /// applied everything and simply never said so.
    /// </para>
    ///
    /// <para>
    /// It is therefore <b>terminal</b>. Every call that finds this status is told what
    /// happened, on every retry, not just the first - a state that decays into "retryable"
    /// after one report is a state that turns one crash into two packs the second time
    /// somebody presses the button. Proceeding means deciding to, with a new key.
    /// </para>
    /// </summary>
    public const string Interrupted = "Interrupted";
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
    /// Pending / Completed / Failed / Interrupted (see <see cref="AgentOperationStatus"/>).
    /// A row is written before its mutation runs, so only Completed proves the write landed -
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

    /// <summary>
    /// Which generation of the claim this is - a fresh value each time the row is claimed
    /// or re-claimed.
    ///
    /// <para>
    /// Settling a claim by key alone is a lost update waiting to happen. A slow caller whose
    /// lease expired, whose row was then taken over by somebody else, would still complete
    /// or abandon "its" key on the way out - stamping the new owner's in-flight claim with
    /// the old owner's outcome. Every settle carries the token it was handed at claim time
    /// and matches on it, so a stale owner's write updates nothing and it learns it lost.
    /// </para>
    /// </summary>
    public string ClaimToken { get; private set; } = string.Empty;

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

    /// <summary>
    /// Set when the operation has been reversed <b>and its inverse landed</b>; null while it
    /// still stands. This is the permanent, completed marker and nothing else may write it.
    /// </summary>
    /// <remarks>
    /// It used to double as the in-progress flag, stamped before the inverse ran so a
    /// concurrent undo would lose the race. That works right up until the inverse does not
    /// finish - a cancellation, an exception, the process dying - and then the row says an
    /// operation was undone that was never undone, and nothing can ever undo it again. The
    /// in-progress half now lives in <see cref="ReversalToken"/>, which is exactly as good a
    /// mutual exclusion and is not a claim about what happened.
    /// </remarks>
    public DateTime? ReversedAt { get; private set; }

    /// <summary>
    /// Who is applying this entry's inverse right now, or null when nobody is. Doubles as
    /// the mutual exclusion between two concurrent <c>reverse_operation</c> calls, which
    /// carry no idempotency key of their own and would otherwise both apply it.
    /// </summary>
    public string? ReversalToken { get; private set; }

    /// <summary>
    /// When the in-flight reversal was claimed. A claim older than the lease belonged to a
    /// caller that died mid-inverse, which - exactly like
    /// <see cref="AgentOperationStatus.Interrupted"/> - is ambiguous rather than free: the
    /// inverse may have committed before the marker could be written. Such a claim is
    /// reported, never silently retaken.
    /// </summary>
    public DateTime? ReversalClaimedAt { get; private set; }

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
            ClaimToken = NewToken(),
            Actor = string.IsNullOrWhiteSpace(actor) ? null : actor.Trim(),
            ClaimedAt = performedAt,
            BatchId = string.IsNullOrWhiteSpace(batchId) ? null : batchId.Trim(),
            AssetType = string.IsNullOrWhiteSpace(assetType) ? null : assetType.Trim(),
            AssetId = assetId,
            PayloadBefore = payloadBefore,
            PayloadAfter = payloadAfter
        };
    }

    /// <summary>
    /// Takes the exclusive right to apply this entry's inverse. The token is what the
    /// caller must present to finish or release the reversal, so a caller whose lease
    /// lapsed cannot settle the claim that replaced it.
    /// </summary>
    public void BeginReversal(string reversalToken, DateTime claimedAt)
    {
        ReversalToken = reversalToken;
        ReversalClaimedAt = claimedAt;
    }

    /// <summary>
    /// Records that the inverse landed. Called only after it did - this is the permanent
    /// marker, and a row that carries it can never be undone again.
    /// </summary>
    public void MarkReversed(DateTime reversedAt)
    {
        ReversedAt = reversedAt;
    }

    /// <summary>
    /// Gives the reversal claim back, for an inverse that turned out not to apply. Leaves
    /// <see cref="ReversedAt"/> alone, because nothing was reversed.
    /// </summary>
    public void ReleaseReversal()
    {
        ReversalToken = null;
        ReversalClaimedAt = null;
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
    /// Records that this claim's owner vanished without settling it, so whether its
    /// mutation landed is unknown. Terminal - see
    /// <see cref="AgentOperationStatus.Interrupted"/> for why it does not decay into
    /// <see cref="AgentOperationStatus.Failed"/>.
    /// </summary>
    public void MarkInterrupted(DateTime noticedAt)
    {
        Status = AgentOperationStatus.Interrupted;
        CompletedAt = noticedAt;
        ClaimedBy = null;
    }

    /// <summary>
    /// Hands a stale Pending claim to a new caller. Used when the previous owner died
    /// between claiming and mutating, which otherwise wedged the key forever.
    /// </summary>
    public void Reclaim(string? claimedBy, DateTime claimedAt, string? actor = null)
    {
        Status = AgentOperationStatus.Pending;
        // A new generation, so the previous owner cannot settle what it no longer holds.
        ClaimToken = NewToken();
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

    /// <summary>True when an in-flight reversal claim has outlived <paramref name="leaseMinutes"/>.</summary>
    public bool IsReversalAbandoned(DateTime now, int leaseMinutes) =>
        ReversedAt is null &&
        ReversalClaimedAt is { } claimedAt &&
        now >= claimedAt.AddMinutes(leaseMinutes);

    /// <summary>A fresh claim generation. Opaque - only ever compared for equality.</summary>
    public static string NewToken() => Guid.NewGuid().ToString("N");
}
