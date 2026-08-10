using System.ComponentModel;
using System.IO;
using System.Text.Json;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Extraction.Jobs;
using Application.Models;
using Application.Packs;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Local MCP <b>write</b> tools — the deferred write phase (prompt 30) that lets an agent
/// do what a user can: tag, categorize, pack, (re-)import, and re-derive. A thin
/// pass-through over the same command handlers the frontend uses (one source of truth).
///
/// Registered ONLY when <c>MCP_WRITE_ENABLED=true</c> (default off), so a stock server
/// stays read-only and enabling writes is a deliberate, operator-scoped opt-in.
///
/// Every write <b>claims</b> its caller-supplied <c>idempotencyKey</c> in
/// <see cref="Domain.Models.AgentOperationLog"/> before applying anything. Claiming first
/// (rather than looking the key up and then writing) is what makes a concurrent batch
/// import safe: with a lookup, two in-flight calls sharing a key both pass the check and
/// both apply.
///
/// Claiming first also means a claim row is <b>not</b> evidence the write happened, so
/// every tool body runs through <see cref="Guarded{T}"/>: only a Completed entry replays
/// as <c>already-applied</c>, a live claim answers <c>in-progress</c> (retryable), and any
/// exit path — returned failure, thrown exception, cancellation — releases the claim
/// rather than leaving the key permanently burned on an operation that never ran.
/// </summary>
[McpServerToolType]
public sealed class AssetWriteMcpTools
{
    [McpServerTool(Name = "set_tags")]
    [Description("Set a model's tags (and optional description), preserving its assigned category. Idempotent per idempotencyKey.")]
    public static Task<object> SetTags(
        IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> getHandler,
        ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> updateHandler,
        IAgentAudit audit,
        [Description("Target model id.")] int modelId,
        [Description("The full tag set to apply (replaces existing tags).")] string[] tags,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Optional description; omit to leave unchanged.")] string? description = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "set-tags", "Model", modelId),
            async ct =>
            {
                // Preserve the current category (UpdateModelTags rewrites all metadata together).
                var current = await getHandler.Handle(new GetModelByIdQuery(modelId), ct);
                if (current.IsFailure)
                {
                    return Failed(current.Error);
                }
                var categoryId = current.Value.Model.Category?.Id;
                var effectiveDescription = description ?? current.Value.Model.Description;

                var result = await updateHandler.Handle(
                    new UpdateModelTagsCommand(modelId, tags, effectiveDescription, categoryId), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", model = result.Value },
                    "Model", modelId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "set_category")]
    [Description("Assign (or clear, with categoryId=null) a model's category without touching tags. Idempotent per idempotencyKey.")]
    public static Task<object> SetCategory(
        ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse> handler,
        IAgentAudit audit,
        [Description("Target model id.")] int modelId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Category id to assign, or null to clear.")] int? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "set-category", "Model", modelId),
            async ct =>
            {
                var result = await handler.Handle(new SetModelCategoryCommand(modelId, categoryId), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", model = result.Value }, "Model", modelId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "create_pack")]
    [Description("Create a new pack (a curated collection). Idempotent per idempotencyKey.")]
    public static Task<object> CreatePack(
        ICommandHandler<CreatePackCommand, CreatePackResponse> handler,
        IAgentAudit audit,
        [Description("Pack name.")] string name,
        [Description("Unique key so a retried call does not re-create.")] string idempotencyKey,
        [Description("Optional description.")] string? description = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "create-pack", "Pack"),
            async ct =>
            {
                var result = await handler.Handle(new CreatePackCommand(name, description, null, null), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", pack = result.Value }, "Pack", result.Value.Id, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_to_pack")]
    [Description("Add a model to a pack. Idempotent per idempotencyKey.")]
    public static Task<object> AddToPack(
        ICommandHandler<AddModelToPackCommand> handler,
        IAgentAudit audit,
        [Description("Target pack id.")] int packId,
        [Description("Model id to add.")] int modelId,
        [Description("Unique key so a retried call does not re-add.")] string idempotencyKey,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "add-to-pack", "Model", modelId),
            async ct =>
            {
                var result = await handler.Handle(new AddModelToPackCommand(packId, modelId), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", packId, modelId }, "Model", modelId, new { packId, modelId });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "trigger_rederive")]
    [Description("Queue a re-extraction of an asset so its parts, derived signals, and search index (incl. semantic labels) are rebuilt. Idempotent — a live job is reused.")]
    public static Task<object> TriggerRederive(
        ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse> handler,
        IAgentAudit audit,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("Unique key so a retried call does not re-queue.")] string idempotencyKey,
        [Description("Version id (models); omit for non-versioned families.")] int? versionId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "trigger-rederive", assetType, assetId),
            async ct =>
            {
                var result = await handler.Handle(
                    new EnqueueExtractionJobCommand(assetType, assetId, versionId), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", jobId = result.Value.JobId, alreadyQueued = result.Value.AlreadyQueued },
                        assetType, assetId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "import_model")]
    [Description("Import a model. Co-located: pass a server-readable file `path` and it is imported. Remote (client != server): omit `path` to get the HTTP upload endpoints to stream bytes to (control plane here, data plane over HTTP).")]
    public static Task<object> ImportModel(
        ICommandHandler<AddModelCommand, AddModelCommandResponse> handler,
        IAgentAudit audit,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Absolute path to a model file readable by the SERVER (co-located import). Omit for remote upload instructions.")] string? path = null,
        [Description("Optional model name (defaults to the file name).")] string? name = null,
        CancellationToken cancellationToken = default)
    {
        // Remote case: bytes must travel over HTTP; point the agent's host at the endpoints.
        // No claim is taken — nothing has been written, so a repeat is free.
        if (string.IsNullOrWhiteSpace(path))
        {
            return Task.FromResult<object>(new
            {
                status = "upload-required",
                message = "The MCP server can't read a client-side path. Stream the file to the HTTP data plane, then finalise with set_category / add_to_pack.",
                uploadEndpoint = "POST /models (multipart form field 'file')",
                multiFileEndpoint = "POST /models/multifile (loose .gltf + external .bin/textures)",
                zipEndpoint = "POST /models/zip",
            });
        }

        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "import-model", "Model"),
            async ct =>
            {
                if (!File.Exists(path))
                {
                    return Failed(new { error = "PathNotFound", message = $"No file readable by the server at '{path}'." });
                }

                byte[] bytes;
                try
                {
                    bytes = await File.ReadAllBytesAsync(path, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    return Failed(new { error = "PathUnreadable", message = ex.Message });
                }

                var upload = new InMemoryFileUpload(Path.GetFileName(path), bytes);
                var result = await handler.Handle(new AddModelCommand(upload, name), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", modelId = result.Value.Id, alreadyExists = result.Value.AlreadyExists },
                    "Model", result.Value.Id, result.Value);
            },
            cancellationToken);
    }

    // ---- claim plumbing -------------------------------------------------------------

    /// <summary>What a guarded tool body produced, and what the audit entry should record.</summary>
    private sealed record ToolOutcome(
        object Response,
        bool Succeeded,
        string? AssetType = null,
        int? AssetId = null,
        object? Payload = null);

    private static ToolOutcome Applied(object response, string? assetType, int? assetId, object payload) =>
        new(response, Succeeded: true, assetType, assetId, payload);

    private static ToolOutcome Failed(SharedKernel.Error error) =>
        new(new { error = error.Code, message = error.Message }, Succeeded: false);

    private static ToolOutcome Failed(object response) => new(response, Succeeded: false);

    /// <summary>
    /// Claims the key, runs <paramref name="body"/>, and settles the claim on every exit
    /// path. A thrown exception or a cancellation releases the claim before propagating —
    /// otherwise a crashed call would leave the key Pending and a later retry would be
    /// told the operation was already applied when nothing had been.
    /// </summary>
    private static async Task<object> Guarded(
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

    private static object AlreadyApplied(Domain.Models.AgentOperationLog prior) => new
    {
        status = "already-applied",
        operation = prior.Operation,
        performedAt = prior.PerformedAt,
        completedAt = prior.CompletedAt,
        assetId = prior.AssetId,
    };

    private static object InProgress(Domain.Models.AgentOperationLog prior) => new
    {
        status = "in-progress",
        operation = prior.Operation,
        claimedAt = prior.ClaimedAt,
        message = "Another call is applying this idempotency key. It has NOT been applied yet — retry, and it will either complete or be retried for you once the claim lapses.",
    };

    private static string Json(object value) => JsonSerializer.Serialize(value);
}
