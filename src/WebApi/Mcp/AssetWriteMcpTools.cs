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
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// Local MCP <b>write</b> tools - the deferred write phase (prompt 30) that lets an agent
/// do what a user can: tag, categorize, pack, (re-)import, and re-derive. A thin
/// pass-through over the same command handlers the frontend uses (one source of truth).
///
/// Registered ONLY when <c>MCP_WRITE_ENABLED=true</c> (default off), so a stock server
/// stays read-only and enabling writes is a deliberate, operator-scoped opt-in.
///
/// Idempotency-claim plumbing lives in <see cref="McpWriteGuard"/>, shared with
/// <see cref="AssetImportMcpTools"/>.
///
/// These tools are <b>Model-only</b> by history, not by design: the other asset families
/// are covered by <see cref="AssetImportMcpTools"/>.
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
    [Description("Queue a re-extraction of an asset so its parts, derived signals, and search index (incl. semantic labels) are rebuilt. Idempotent - a live job is reused.")]
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
        // No claim is taken - nothing has been written, so a repeat is free.
        //
        // Field names and a worked example are returned, not just endpoint paths. The
        // obvious reading of "POST /models/multifile (loose .gltf + external .bin)" is
        // "post the files", which 400s: the real contract pairs each file with the URI it
        // is referenced by, and an agent gets one guess before it burns a turn.
        if (string.IsNullOrWhiteSpace(path))
        {
            return Task.FromResult<object>(new
            {
                status = "upload-required",
                message = "The MCP server can't read a client-side path. Stream the file to the HTTP data plane, then finalise with set_category / add_to_pack.",
                single = new
                {
                    endpoint = "POST /models",
                    contentType = "multipart/form-data",
                    fields = new { file = "the model file (required)" },
                },
                multiFile = new
                {
                    endpoint = "POST /models/multifile",
                    contentType = "multipart/form-data",
                    whenToUse = "a loose .gltf that references external .bin/texture files",
                    fields = new
                    {
                        primary = "the .gltf itself (required)",
                        files = "each referenced file, repeated once per file (required)",
                        paths = "the URI each files[i] is referenced BY, relative to the primary - same order, same count as files[]",
                    },
                    example = "primary=scene.gltf; files=scene.bin, files=textures/wood.png; paths=scene.bin, paths=textures/wood.png",
                    commonMistake = "Posting only the files and omitting paths[] - the server cannot resolve the glTF's URIs and returns 400 MissingPrimary or a broken import.",
                },
                zip = new
                {
                    endpoint = "POST /models/zip",
                    contentType = "multipart/form-data",
                    fields = new { file = "a .zip containing the model and its companions" },
                    whenToUse = "simplest correct choice for any multi-file asset - the server unpacks and resolves references itself",
                },
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

}
