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
        object? Payload = null);

    internal static ToolOutcome Applied(object response, string? assetType, int? assetId, object payload) =>
        new(response, Succeeded: true, assetType, assetId, payload);

    internal static ToolOutcome Failed(SharedKernel.Error error) =>
        new(new { error = error.Code, message = error.Message }, Succeeded: false);

    internal static ToolOutcome Failed(object response) => new(response, Succeeded: false);

    /// <summary>
    /// Claims the key, runs <paramref name="body"/>, and settles the claim on every exit
    /// path. A thrown exception or a cancellation releases the claim before propagating -
    /// otherwise a crashed call would leave the key Pending and a later retry would be
    /// told the operation was already applied when nothing had been.
    /// </summary>
    internal static async Task<object> Guarded(
        IAgentAudit audit,
        AgentWrite write,
        Func<CancellationToken, Task<ToolOutcome>> body,
        CancellationToken cancellationToken)
    {
        var claim = await audit.TryBeginAsync(write, cancellationToken);
        switch (claim.Outcome)
        {
            case AgentClaimOutcome.AlreadyApplied:
                return AlreadyApplied(claim.Entry!);
            case AgentClaimOutcome.InProgress:
                return InProgress(claim.Entry!);
        }

        try
        {
            var outcome = await body(cancellationToken);
            if (!outcome.Succeeded)
            {
                await audit.AbandonAsync(write.IdempotencyKey, CancellationToken.None);
                return outcome.Response;
            }

            await audit.CompleteAsync(
                write.IdempotencyKey,
                outcome.AssetType,
                outcome.AssetId,
                outcome.Payload is null ? null : Json(outcome.Payload),
                CancellationToken.None);
            return outcome.Response;
        }
        catch
        {
            // CancellationToken.None on purpose: the caller's token may already be
            // cancelled, and releasing the claim is exactly what must still happen.
            await audit.AbandonAsync(write.IdempotencyKey, CancellationToken.None);
            throw;
        }
    }

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

    private static string Json(object value) => JsonSerializer.Serialize(value);
}
