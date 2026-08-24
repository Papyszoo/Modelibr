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
/// <c>already-applied</c>, and a live claim answers <c>in-progress</c> (retryable).
///
/// How an exit path settles its claim follows one rule: <b>does this path know the
/// mutation did not happen?</b> A returned failure does - the tool declined before it
/// mutated - so it releases the key as Failed and a corrected retry may take it over.
/// Nothing else does. The mutation commits before the entry is marked Completed, so a
/// throw, a cancellation, or a <c>CompleteAsync</c> that itself fails all sit in the
/// window where the write may already be durable. Those move the claim to a
/// <b>terminal</b> Interrupted state instead: every call on that key is told what
/// happened, and none of them re-runs it. The alternative - release it and let the next
/// retry through - is a committed <c>create_pack</c> quietly becoming two packs on the
/// second press of the button.
///
/// The process dying settles nothing at all, and the lease covers that: a claim still
/// Pending past its lease reaches the same Interrupted state from the other side.
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
    /// the claim on every exit path - as Failed only where the path knows nothing was
    /// mutated, and as terminal Interrupted wherever the commit status is unknown.
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

        ToolOutcome outcome;
        try
        {
            outcome = await body(cancellationToken);
        }
        catch
        {
            // Everything from here on is "unknown", not "no". The body commits its own
            // mutation, so a throw or a cancellation out of it may be a throw *after* the
            // write already landed - a timed-out command whose transaction committed anyway,
            // an after-commit dispatch that blew up, a token cancelled between the two.
            // Failing the claim here is what used to make that key retryable and the pack
            // duplicate. Interrupt is durable and terminal, so the retry is told instead.
            await Interrupt(audit, write, token, assetType: null, assetId: null);
            throw;
        }

        if (!outcome.Succeeded)
        {
            // The one path that genuinely knows. A returned failure is a tool declining
            // before it mutated - a validation error, a missing asset, a disabled flag - so
            // the key goes back to Failed and a corrected retry may take it over.
            //
            // CancellationToken.None on purpose: the caller's token may already be
            // cancelled, and releasing the claim is exactly what must still happen. The
            // claim token means a claim we no longer own is left alone rather than trampled.
            await audit.AbandonAsync(write.IdempotencyKey, token, CancellationToken.None);
            return outcome.Response;
        }

        bool recorded;
        try
        {
            recorded = await audit.CompleteAsync(
                write.IdempotencyKey,
                token,
                outcome.AssetType,
                outcome.AssetId,
                outcome.Payload is null ? null : Json(outcome.Payload),
                outcome.PayloadBefore is null ? null : Json(outcome.PayloadBefore),
                CancellationToken.None);
        }
        catch
        {
            // The mutation is already durable; only the record of it is missing. Releasing
            // the key would offer the caller a retry that re-applies a write that happened.
            // Interrupt it - recording what it was working on, so the recovery answer can
            // name it - and report the ambiguity rather than the success.
            if (await Interrupt(audit, write, token, outcome.AssetType, outcome.AssetId))
            {
                return InterruptedAfterWrite(write, outcome.AssetType, outcome.AssetId);
            }

            // Could not even record the ambiguity. The row stays Pending, which its lease
            // turns into the same terminal Interrupted state; the caller gets the original
            // fault rather than a success this call cannot stand behind.
            throw;
        }

        // The write landed but the claim had moved on - this call outlived its lease and
        // somebody else now holds the key. Saying so is the only honest answer: the
        // mutation is real, and the log no longer speaks for it.
        return recorded ? outcome.Response : LostClaim(write, outcome.Response);
    }

    /// <summary>
    /// Moves this call's claim into the durable ambiguous state, swallowing whatever the
    /// attempt itself throws.
    /// </summary>
    /// <remarks>
    /// Swallowing is deliberate and narrow: the caller is already on a failure path and is
    /// about to propagate a fault of its own, and a second exception raised from the settle
    /// would replace the real one. A settle that cannot run leaves the row Pending, and the
    /// lease sweep moves a Pending claim nobody settled to the same terminal Interrupted
    /// state - so the guarantee holds either way, just later.
    /// </remarks>
    private static async Task<bool> Interrupt(
        IAgentAudit audit, AgentWrite write, string token, string? assetType, int? assetId)
    {
        try
        {
            // CancellationToken.None: this runs precisely when the caller's token may be
            // cancelled, and it is the settle that must still happen.
            return await audit.InterruptAsync(
                write.IdempotencyKey, token, assetType, assetId, CancellationToken.None);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// A write that committed and could not be recorded. Shaped like
    /// <see cref="Interrupted"/> on purpose: this call and every later call on the key are
    /// answering the same question, and they must not answer it differently.
    /// </summary>
    private static object InterruptedAfterWrite(AgentWrite write, string? assetType, int? assetId) => new
    {
        status = "interrupted",
        operation = write.Operation,
        assetId,
        assetType,
        message = "The operation was applied, but recording its outcome failed, so this idempotency key can no " +
                  "longer say whether it ran. The key is now permanently in that state and will answer the same " +
                  "to every call.",
        remedy = "Check whether the operation's effect is already there (the recorded assetId, if any, is the one " +
                 "it was working on). If it is, there is nothing to do. If it is not, repeat the operation under a " +
                 "NEW idempotency key - retrying this one will not run it.",
    };

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
