using System.Text.Json;
using Application.Agents;

namespace WebApi.Mcp;

/// <summary>
/// Idempotency-claim plumbing shared by every MCP write tool.
///
/// Every write <b>claims</b> its caller-supplied <c>idempotencyKey</c> in
/// <see cref="Domain.Models.AgentOperationLog"/> before applying anything. Claiming first
/// (rather than looking the key up and then writing) is what makes a concurrent batch
/// import safe: with a lookup, two in-flight calls sharing a key both pass the check and
/// both apply.
///
/// Claiming first also means a claim row is <b>not</b> evidence the write happened, so
/// every tool body runs through <see cref="Guarded"/>: only a Completed entry replays as
/// <c>already-applied</c>, a live claim answers <c>in-progress</c> (retryable), and any
/// exit path - returned failure, thrown exception, cancellation - releases the claim
/// rather than leaving the key permanently burned on an operation that never ran.
///
/// The one exit path that cannot release its own claim is the process dying, and that is
/// why <c>interrupted</c> exists. The mutation commits before the entry is marked
/// Completed, so a claim still Pending when its owner died may have applied everything
/// and never recorded it. The lease moves such a claim to a <b>terminal</b> Interrupted
/// state: every call on that key is told what happened, and none of them re-runs it. The
/// alternative - report once, then let the next retry through - is a crashed
/// <c>create_pack</c> quietly becoming two packs on the second press of the button.
///
/// Every settle also carries the claim <b>token</b> it was handed. A call whose lease
/// lapsed while it was still running would otherwise complete or abandon its key on the
/// way out and stamp its outcome onto whatever now owns that key.
///
/// Lives apart from any one tool class so the import tools for the other asset families
/// inherit these guarantees rather than reimplementing them - the concurrency bug this
/// prevents was found the hard way, and one copy is the only way it stays fixed.
/// </summary>
internal static class McpWriteGuard
{
    /// <summary>What a guarded tool body produced, and what the audit entry should record.</summary>
    internal sealed record ToolOutcome(
        object Response,
        bool Succeeded,
        string? AssetType = null,
        int? AssetId = null,
        object? Payload = null,
        object? PayloadBefore = null);

    internal static ToolOutcome Applied(object response, string? assetType, int? assetId, object payload) =>
        new(response, Succeeded: true, assetType, assetId, payload);

    /// <summary>
    /// An applied write that also records the state it replaced, so
    /// <c>reverse_operation</c> has something to restore. Every tool that overwrites or
    /// removes prior state must use this overload - a write whose "before" is missing is
    /// one the agent cannot undo.
    /// </summary>
    internal static ToolOutcome Applied(
        object response, string? assetType, int? assetId, object payload, object? payloadBefore) =>
        new(response, Succeeded: true, assetType, assetId, payload, payloadBefore);

    internal static ToolOutcome Failed(SharedKernel.Error error) =>
        new(new { error = error.Code, message = error.Message }, Succeeded: false);

    internal static ToolOutcome Failed(object response) => new(response, Succeeded: false);

    /// <summary>
    /// Checks the caller's scope, claims the key, runs <paramref name="body"/>, and settles
    /// the claim on every exit path. A thrown exception or a cancellation releases the
    /// claim before propagating - otherwise a crashed call would leave the key Pending and
    /// a later retry would be told the operation was already applied when nothing had been.
    ///
    /// The scope check happens <b>before</b> the claim: a denied call must not burn an
    /// idempotency key, or the operator who then widens the token would find the retry
    /// answered "already applied" for a write that never ran.
    /// </summary>
    internal static async Task<object> Guarded(
        IAgentAudit audit,
        McpCallerContext caller,
        AgentWrite write,
        Func<CancellationToken, Task<ToolOutcome>> body,
        CancellationToken cancellationToken,
        McpScope required = McpScope.Write)
    {
        var denied = caller.Denied(required);
        if (denied is not null)
        {
            return denied;
        }

        // Attribution is stamped here rather than at each call site so no tool can write
        // an unattributed row by forgetting to pass it.
        write = write with { Actor = caller.Actor };

        var claim = await audit.TryBeginAsync(write, cancellationToken);
        switch (claim.Outcome)
        {
            case AgentClaimOutcome.AlreadyApplied:
                return AlreadyApplied(claim.Entry!);
            case AgentClaimOutcome.InProgress:
                return InProgress(claim.Entry!);
            case AgentClaimOutcome.Interrupted:
                return Interrupted(claim.Entry!);
        }

        var token = claim.ClaimToken!;
        try
        {
            var outcome = await body(cancellationToken);
            if (!outcome.Succeeded)
            {
                await audit.AbandonAsync(write.IdempotencyKey, token, CancellationToken.None);
                return outcome.Response;
            }

            var recorded = await audit.CompleteAsync(
                write.IdempotencyKey,
                token,
                outcome.AssetType,
                outcome.AssetId,
                outcome.Payload is null ? null : Json(outcome.Payload),
                outcome.PayloadBefore is null ? null : Json(outcome.PayloadBefore),
                CancellationToken.None);

            // The write landed but the claim had moved on - this call outlived its lease and
            // somebody else now holds the key. Saying so is the only honest answer: the
            // mutation is real, and the log no longer speaks for it.
            return recorded ? outcome.Response : LostClaim(write, outcome.Response);
        }
        catch
        {
            // CancellationToken.None on purpose: the caller's token may already be
            // cancelled, and releasing the claim is exactly what must still happen. The
            // token means a claim we no longer own is left alone rather than trampled.
            await audit.AbandonAsync(write.IdempotencyKey, token, CancellationToken.None);
            throw;
        }
    }

    /// <summary>
    /// A write that succeeded on a claim its caller had already lost. Rare - it takes the
    /// whole lease to elapse mid-call - but silently returning the normal response would
    /// leave a real mutation with no entry describing it, which is the one thing the audit
    /// log exists to prevent.
    /// </summary>
    private static object LostClaim(AgentWrite write, object response) => new
    {
        status = "applied-unrecorded",
        operation = write.Operation,
        message = "The operation was applied, but its idempotency claim had already lapsed and been taken " +
                  "over, so the audit log does not record this call's outcome.",
        remedy = "Do NOT retry with the same key - the write happened. Check the affected asset, and use a " +
                 "new key for any further write.",
        result = response,
    };

    /// <summary>
    /// Reads a server-readable path into the same content-addressed pipeline a multipart
    /// upload uses. Returns a failure outcome the tool can return as-is, so every import
    /// tool reports an unreadable path the same way instead of throwing.
    /// </summary>
    internal static async Task<(ToolOutcome? Failure, Application.Files.InMemoryFileUpload? Upload)> ReadUploadAsync(
        string path,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return (Failed(new { error = "PathNotFound", message = $"No file readable by the server at '{path}'." }), null);
        }

        try
        {
            var bytes = await File.ReadAllBytesAsync(path, cancellationToken);
            return (null, new Application.Files.InMemoryFileUpload(Path.GetFileName(path), bytes));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return (Failed(new { error = "PathUnreadable", message = ex.Message }), null);
        }
    }

    internal static object AlreadyApplied(Domain.Models.AgentOperationLog prior) => new
    {
        status = "already-applied",
        operation = prior.Operation,
        performedAt = prior.PerformedAt,
        completedAt = prior.CompletedAt,
        assetId = prior.AssetId,
    };

    internal static object InProgress(Domain.Models.AgentOperationLog prior) => new
    {
        status = "in-progress",
        operation = prior.Operation,
        claimedAt = prior.ClaimedAt,
        message = "Another call is applying this idempotency key. It has NOT been applied yet - retry, and it will either complete or be retried for you once the claim lapses.",
    };

    /// <summary>
    /// A key whose previous holder died mid-write.
    ///
    /// Deliberately NOT re-run on the caller's behalf, and deliberately not re-runnable by
    /// a later call either. The mutation commits before the entry is marked Completed, so a
    /// claim still Pending when its owner died may have applied everything and simply never
    /// said so - and this surface creates packs, scenes and imports, where doing it twice is
    /// not a no-op. Releasing the key after one report would only move the duplicate to the
    /// following call; the key is terminal instead, and proceeding means a new key, which is
    /// a decision somebody made rather than a retry nobody saw.
    /// </summary>
    internal static object Interrupted(Domain.Models.AgentOperationLog prior) => new
    {
        status = "interrupted",
        operation = prior.Operation,
        claimedAt = prior.ClaimedAt,
        assetId = prior.AssetId,
        assetType = prior.AssetType,
        message = "A previous call with this idempotency key stopped before it could record its outcome, so whether it applied is unknown. This key is now permanently in that state and will answer the same to every call.",
        remedy = "Check whether the operation's effect is already there (the recorded assetId, if any, is the one it was working on). If it is, there is nothing to do. If it is not, repeat the operation under a NEW idempotency key - retrying this one will not run it.",
    };

    /// <summary>
    /// The operator flag that permits work nothing can quietly undo.
    ///
    /// Here rather than on one tool class because two of them gate on it, and a second copy
    /// of the flag name is a second thing to get wrong the day it is renamed.
    /// </summary>
    internal const string DestructiveFlag = "MCP_DESTRUCTIVE_ENABLED";

    internal static bool DestructiveEnabled(IConfiguration configuration) =>
        configuration[DestructiveFlag] == "true";

    internal static object DestructiveDisabled(string what) => new
    {
        error = "DestructiveDisabled",
        message = $"{what}, and {DestructiveFlag} is not enabled on this server.",
        remedy = $"Ask the operator to set {DestructiveFlag}=true and restart the Web API. Until then, dry runs still work.",
    };

    private static string Json(object value) => JsonSerializer.Serialize(value);
}
