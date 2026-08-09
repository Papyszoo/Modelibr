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
/// stays read-only and enabling writes is a deliberate, operator-scoped opt-in. Every
/// write requires a caller-supplied <c>idempotencyKey</c> and is recorded in
/// <see cref="Domain.Models.AgentOperationLog"/>; a repeat with the same key is a no-op.
/// </summary>
[McpServerToolType]
public sealed class AssetWriteMcpTools
{
    [McpServerTool(Name = "set_tags")]
    [Description("Set a model's tags (and optional description), preserving its assigned category. Idempotent per idempotencyKey.")]
    public static async Task<object> SetTags(
        IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> getHandler,
        ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> updateHandler,
        IAgentAudit audit,
        [Description("Target model id.")] int modelId,
        [Description("The full tag set to apply (replaces existing tags).")] string[] tags,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Optional description; omit to leave unchanged.")] string? description = null,
        CancellationToken cancellationToken = default)
    {
        var prior = await audit.FindAsync(idempotencyKey, cancellationToken);
        if (prior is not null)
        {
            return AlreadyApplied(prior);
        }

        // Preserve the current category (UpdateModelTags rewrites all metadata together).
        var current = await getHandler.Handle(new GetModelByIdQuery(modelId), cancellationToken);
        if (current.IsFailure)
        {
            return Error(current.Error);
        }
        var categoryId = current.Value.Model.Category?.Id;
        var effectiveDescription = description ?? current.Value.Model.Description;

        var result = await updateHandler.Handle(
            new UpdateModelTagsCommand(modelId, tags, effectiveDescription, categoryId), cancellationToken);
        if (result.IsFailure)
        {
            return Error(result.Error);
        }

        await audit.RecordAsync(new AgentWrite(
            idempotencyKey, "set-tags", "Model", modelId, PayloadAfter: Json(result.Value)), cancellationToken);
        return new { status = "ok", model = result.Value };
    }

    [McpServerTool(Name = "set_category")]
    [Description("Assign (or clear, with categoryId=null) a model's category without touching tags. Idempotent per idempotencyKey.")]
    public static async Task<object> SetCategory(
        ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse> handler,
        IAgentAudit audit,
        [Description("Target model id.")] int modelId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Category id to assign, or null to clear.")] int? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        var prior = await audit.FindAsync(idempotencyKey, cancellationToken);
        if (prior is not null)
        {
            return AlreadyApplied(prior);
        }

        var result = await handler.Handle(new SetModelCategoryCommand(modelId, categoryId), cancellationToken);
        if (result.IsFailure)
        {
            return Error(result.Error);
        }

        await audit.RecordAsync(new AgentWrite(
            idempotencyKey, "set-category", "Model", modelId, PayloadAfter: Json(result.Value)), cancellationToken);
        return new { status = "ok", model = result.Value };
    }

    [McpServerTool(Name = "create_pack")]
    [Description("Create a new pack (a curated collection). Idempotent per idempotencyKey.")]
    public static async Task<object> CreatePack(
        ICommandHandler<CreatePackCommand, CreatePackResponse> handler,
        IAgentAudit audit,
        [Description("Pack name.")] string name,
        [Description("Unique key so a retried call does not re-create.")] string idempotencyKey,
        [Description("Optional description.")] string? description = null,
        CancellationToken cancellationToken = default)
    {
        var prior = await audit.FindAsync(idempotencyKey, cancellationToken);
        if (prior is not null)
        {
            return AlreadyApplied(prior);
        }

        var result = await handler.Handle(new CreatePackCommand(name, description, null, null), cancellationToken);
        if (result.IsFailure)
        {
            return Error(result.Error);
        }

        await audit.RecordAsync(new AgentWrite(
            idempotencyKey, "create-pack", "Pack", result.Value.Id, PayloadAfter: Json(result.Value)), cancellationToken);
        return new { status = "ok", pack = result.Value };
    }

    [McpServerTool(Name = "add_to_pack")]
    [Description("Add a model to a pack. Idempotent per idempotencyKey.")]
    public static async Task<object> AddToPack(
        ICommandHandler<AddModelToPackCommand> handler,
        IAgentAudit audit,
        [Description("Target pack id.")] int packId,
        [Description("Model id to add.")] int modelId,
        [Description("Unique key so a retried call does not re-add.")] string idempotencyKey,
        CancellationToken cancellationToken = default)
    {
        var prior = await audit.FindAsync(idempotencyKey, cancellationToken);
        if (prior is not null)
        {
            return AlreadyApplied(prior);
        }

        var result = await handler.Handle(new AddModelToPackCommand(packId, modelId), cancellationToken);
        if (result.IsFailure)
        {
            return Error(result.Error);
        }

        await audit.RecordAsync(new AgentWrite(
            idempotencyKey, "add-to-pack", "Model", modelId,
            PayloadAfter: Json(new { packId, modelId })), cancellationToken);
        return new { status = "ok", packId, modelId };
    }

    [McpServerTool(Name = "trigger_rederive")]
    [Description("Queue a re-extraction of an asset so its parts, derived signals, and search index (incl. semantic labels) are rebuilt. Idempotent — a live job is reused.")]
    public static async Task<object> TriggerRederive(
        ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse> handler,
        IAgentAudit audit,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("Unique key so a retried call does not re-queue.")] string idempotencyKey,
        [Description("Version id (models); omit for non-versioned families.")] int? versionId = null,
        CancellationToken cancellationToken = default)
    {
        var prior = await audit.FindAsync(idempotencyKey, cancellationToken);
        if (prior is not null)
        {
            return AlreadyApplied(prior);
        }

        var result = await handler.Handle(
            new EnqueueExtractionJobCommand(assetType, assetId, versionId), cancellationToken);
        if (result.IsFailure)
        {
            return Error(result.Error);
        }

        await audit.RecordAsync(new AgentWrite(
            idempotencyKey, "trigger-rederive", assetType, assetId,
            PayloadAfter: Json(result.Value)), cancellationToken);
        return new { status = "ok", jobId = result.Value.JobId, alreadyQueued = result.Value.AlreadyQueued };
    }

    [McpServerTool(Name = "import_model")]
    [Description("Import a model. Co-located: pass a server-readable file `path` and it is imported. Remote (client != server): omit `path` to get the HTTP upload endpoints to stream bytes to (control plane here, data plane over HTTP).")]
    public static async Task<object> ImportModel(
        ICommandHandler<AddModelCommand, AddModelCommandResponse> handler,
        IAgentAudit audit,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Absolute path to a model file readable by the SERVER (co-located import). Omit for remote upload instructions.")] string? path = null,
        [Description("Optional model name (defaults to the file name).")] string? name = null,
        CancellationToken cancellationToken = default)
    {
        // Remote case: bytes must travel over HTTP; point the agent's host at the endpoints.
        if (string.IsNullOrWhiteSpace(path))
        {
            return new
            {
                status = "upload-required",
                message = "The MCP server can't read a client-side path. Stream the file to the HTTP data plane, then finalise with set_category / add_to_pack.",
                uploadEndpoint = "POST /models (multipart form field 'file')",
                multiFileEndpoint = "POST /models/multifile (loose .gltf + external .bin/textures)",
                zipEndpoint = "POST /models/zip",
            };
        }

        var prior = await audit.FindAsync(idempotencyKey, cancellationToken);
        if (prior is not null)
        {
            return AlreadyApplied(prior);
        }

        if (!File.Exists(path))
        {
            return new { error = "PathNotFound", message = $"No file readable by the server at '{path}'." };
        }

        byte[] bytes;
        try
        {
            bytes = await File.ReadAllBytesAsync(path, cancellationToken);
        }
        catch (Exception ex)
        {
            return new { error = "PathUnreadable", message = ex.Message };
        }

        var upload = new InMemoryFileUpload(Path.GetFileName(path), bytes);
        var result = await handler.Handle(new AddModelCommand(upload, name), cancellationToken);
        if (result.IsFailure)
        {
            return Error(result.Error);
        }

        await audit.RecordAsync(new AgentWrite(
            idempotencyKey, "import-model", "Model", result.Value.Id,
            PayloadAfter: Json(result.Value)), cancellationToken);
        return new { status = "ok", modelId = result.Value.Id, alreadyExists = result.Value.AlreadyExists };
    }

    private static object AlreadyApplied(Domain.Models.AgentOperationLog prior) => new
    {
        status = "already-applied",
        operation = prior.Operation,
        performedAt = prior.PerformedAt,
        assetId = prior.AssetId,
    };

    private static object Error(SharedKernel.Error error) => new { error = error.Code, message = error.Message };

    private static string Json(object value) => JsonSerializer.Serialize(value);
}
