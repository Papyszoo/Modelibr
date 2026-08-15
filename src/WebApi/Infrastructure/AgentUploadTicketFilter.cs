using System.Reflection;
using System.Text.Json;
using Application.Abstractions.Services;
using Application.Agents;

namespace WebApi.Infrastructure;

/// <summary>
/// Gives a remote agent's HTTP upload the same guarantees its co-located equivalent has:
/// an audit entry and apply-once idempotency.
///
/// The gap this closes: an MCP write tool that cannot read the client's disk hands back
/// upload endpoints and steps out. Every byte then arrives as an ordinary anonymous
/// multipart POST, so the remote half of an import produced <b>no audit entry and no
/// idempotency</b> - the two things the control plane promises. An agent whose upload timed
/// out mid-stream had no safe way to retry.
///
/// A request carrying no ticket header is untouched, so this is invisible to the UI and to
/// anyone using the API directly. A request carrying one is audited under the ticket's
/// idempotency key, attributed to the token that requested it, and settled by the
/// endpoint's own outcome: a 4xx releases both the claim and the ticket, so the agent can
/// fix its request and retry with the same key rather than being told the write already
/// happened.
/// </summary>
public sealed class AgentUploadTicketFilter : IEndpointFilter
{
    /// <summary>Header an agent presents the ticket secret in.</summary>
    public const string TicketHeader = "X-Modelibr-Upload-Ticket";

    /// <summary>
    /// Cap on the recorded response payload. Audit rows are for review and reversal, not
    /// for storing a second copy of a model's full DTO graph.
    /// </summary>
    private const int MaxRecordedPayloadChars = 8_000;

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var presented = context.HttpContext.Request.Headers[TicketHeader].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(presented))
        {
            return await next(context);
        }

        var services = context.HttpContext.RequestServices;
        var tickets = services.GetRequiredService<IAgentUploadTickets>();
        var cancellationToken = context.HttpContext.RequestAborted;

        var ticket = await tickets.TryRedeemAsync(presented, cancellationToken);
        if (ticket is null)
        {
            return Results.Json(
                new
                {
                    error = "InvalidUploadTicket",
                    message = "This upload ticket is unknown, expired, already used, or currently in flight.",
                    remedy = "Request a fresh ticket from the MCP import tool by calling it without a path.",
                },
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var audit = services.GetRequiredService<IAgentAudit>();
        var write = new AgentWrite(
            ticket.IdempotencyKey,
            ticket.Operation,
            ticket.AssetType,
            BatchId: ticket.BatchId,
            Actor: ticket.Actor);

        var claim = await audit.TryBeginAsync(write, cancellationToken);
        switch (claim.Outcome)
        {
            case AgentClaimOutcome.AlreadyApplied:
                // The retry of an upload that already landed - answer with the recorded
                // result instead of importing a second copy of the same bytes.
                await tickets.SettleAsync(ticket.TicketId, succeeded: true, claim.Entry!.AssetId, CancellationToken.None);
                return Results.Json(new
                {
                    status = "already-applied",
                    operation = claim.Entry.Operation,
                    assetId = claim.Entry.AssetId,
                    completedAt = claim.Entry.CompletedAt,
                });

            case AgentClaimOutcome.InProgress:
                await tickets.SettleAsync(ticket.TicketId, succeeded: false, null, CancellationToken.None);
                return Results.Json(
                    new
                    {
                        status = "in-progress",
                        message = "Another upload is applying this ticket's idempotency key. It has NOT been applied yet - retry once it settles.",
                    },
                    statusCode: StatusCodes.Status409Conflict);
        }

        object? result;
        try
        {
            result = await next(context);
        }
        catch
        {
            // CancellationToken.None on purpose: the request may already be aborted, and
            // releasing the claim is exactly what must still happen.
            await audit.AbandonAsync(ticket.IdempotencyKey, CancellationToken.None);
            await tickets.SettleAsync(ticket.TicketId, succeeded: false, null, CancellationToken.None);
            throw;
        }

        var (succeeded, value) = Inspect(result);
        if (succeeded)
        {
            await audit.CompleteAsync(
                ticket.IdempotencyKey,
                ticket.AssetType,
                ExtractAssetId(value, ticket.AssetType),
                Describe(value),
                null,
                CancellationToken.None);
            await tickets.SettleAsync(
                ticket.TicketId, succeeded: true, ExtractAssetId(value, ticket.AssetType), CancellationToken.None);
        }
        else
        {
            await audit.AbandonAsync(ticket.IdempotencyKey, CancellationToken.None);
            await tickets.SettleAsync(ticket.TicketId, succeeded: false, null, CancellationToken.None);
        }

        return result;
    }

    /// <summary>
    /// Whether the endpoint reported success, and the value it returned. A result that
    /// carries no status code is a plain payload the framework will serialize as 200.
    /// </summary>
    private static (bool Succeeded, object? Value) Inspect(object? result)
    {
        var value = result is IValueHttpResult valueResult ? valueResult.Value : result;

        if (result is IStatusCodeHttpResult { StatusCode: { } statusCode })
        {
            return (statusCode is >= 200 and < 300, value);
        }

        return (true, value);
    }

    /// <summary>
    /// Digs the created asset's id out of the endpoint's response DTO, preferring a
    /// family-specific name (<c>SoundId</c>) over a bare <c>Id</c>, since several DTOs carry
    /// both and the family-specific one is the asset rather than its file or job.
    /// </summary>
    private static int? ExtractAssetId(object? value, string assetType)
    {
        if (value is null)
        {
            return null;
        }

        var properties = value.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance);

        foreach (var name in new[] { $"{assetType}Id", "Id" })
        {
            var property = properties.FirstOrDefault(p =>
                string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase) &&
                (p.PropertyType == typeof(int) || p.PropertyType == typeof(int?)));

            if (property?.GetValue(value) is int id && id > 0)
            {
                return id;
            }
        }

        return null;
    }

    private static string? Describe(object? value)
    {
        if (value is null)
        {
            return null;
        }

        try
        {
            var json = JsonSerializer.Serialize(value);
            return json.Length <= MaxRecordedPayloadChars
                ? json
                : JsonSerializer.Serialize(new { truncated = true, length = json.Length });
        }
        catch (NotSupportedException)
        {
            // A DTO that will not serialize must not fail an upload that already succeeded.
            return null;
        }
    }
}
