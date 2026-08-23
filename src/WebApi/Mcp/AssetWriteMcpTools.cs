using System.ComponentModel;
using System.IO;
using System.Text.Json;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Agents;
using Application.Extraction.Jobs;
using Application.Models;
using Application.Packs;
using Application.Search;
using ModelContextProtocol.Server;
using WebApi.Infrastructure;
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
        McpCallerContext caller,
        [Description("Target model id.")] int modelId,
        [Description("The full tag set to apply (replaces existing tags).")] string[] tags,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Optional description; omit to leave unchanged.")] string? description = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "set-tags", "Model", modelId, BatchId: batchId),
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

                // The same read that preserves the category is what makes this undoable -
                // tags are replaced wholesale, so the set being overwritten is the only
                // record of what the model was tagged with.
                var before = new
                {
                    tags = current.Value.Model.Tags,
                    description = current.Value.Model.Description,
                    categoryId,
                };

                var result = await updateHandler.Handle(
                    new UpdateModelTagsCommand(modelId, tags, effectiveDescription, categoryId), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", model = result.Value },
                    "Model", modelId, result.Value, before);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "set_category")]
    [Description("Assign (or clear, with categoryId=null) a model's category without touching tags. Idempotent per idempotencyKey.")]
    public static Task<object> SetCategory(
        IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> getHandler,
        ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target model id.")] int modelId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Category id to assign, or null to clear.")] int? categoryId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "set-category", "Model", modelId, BatchId: batchId),
            async ct =>
            {
                // Read the category being replaced first: an agent that re-categorizes a
                // hundred models on a bad guess needs the old assignment to go back to.
                var current = await getHandler.Handle(new GetModelByIdQuery(modelId), ct);
                if (current.IsFailure)
                {
                    return Failed(current.Error);
                }

                var before = new { categoryId = current.Value.Model.Category?.Id };

                var result = await handler.Handle(new SetModelCategoryCommand(modelId, categoryId), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", model = result.Value }, "Model", modelId, result.Value, before);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "create_pack")]
    [Description("Create a new pack (a curated collection). Idempotent per idempotencyKey.")]
    public static Task<object> CreatePack(
        ICommandHandler<CreatePackCommand, CreatePackResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Pack name.")] string name,
        [Description("Unique key so a retried call does not re-create.")] string idempotencyKey,
        [Description("Optional description.")] string? description = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "create-pack", "Pack", BatchId: batchId),
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
        IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> getHandler,
        ICommandHandler<AddModelToPackCommand> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target pack id.")] int packId,
        [Description("Model id to add.")] int modelId,
        [Description("Unique key so a retried call does not re-add.")] string idempotencyKey,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-to-pack", "Model", modelId, BatchId: batchId),
            async ct =>
            {
                // Whether the model was already in this pack decides what undo may do: if it
                // was, this write added nothing and reversing it must not remove a membership
                // the agent never created.
                var current = await getHandler.Handle(new GetModelByIdQuery(modelId), ct);
                if (current.IsFailure)
                {
                    return Failed(current.Error);
                }

                var before = new { packId, wasMember = current.Value.Model.Packs.Any(p => p.Id == packId) };

                var result = await handler.Handle(new AddModelToPackCommand(packId, modelId), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", packId, modelId }, "Model", modelId, new { packId, modelId }, before);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "trigger_rederive")]
    [Description("Queue a re-extraction of an asset so its parts, derived signals, and search index (incl. semantic labels) are rebuilt. Idempotent - a live job is reused.")]
    public static Task<object> TriggerRederive(
        ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("Unique key so a retried call does not re-queue.")] string idempotencyKey,
        [Description("Version id (models); omit for non-versioned families.")] int? versionId = null,
        [Description("Optional batch id, grouping this with related writes.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "trigger-rederive", assetType, assetId, BatchId: batchId),
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

    [McpServerTool(Name = "reindex_search")]
    [Description("Rebuild the search index from data already stored - no files are read and nothing is re-extracted. " +
                 "Run it after the search vocabulary changes (new synonyms/abbreviations), or when an asset is findable in the " +
                 "library but not by search_assets. Omit modelId to rebuild the whole library. " +
                 "It cannot refresh derived signals such as tokens or prominence - that is trigger_rederive.")]
    public static Task<object> ReindexSearch(
        ICommandHandler<ReprojectSearchDocumentsCommand, ReprojectSearchDocumentsResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Unique key so a retried call does not rebuild twice.")] string idempotencyKey,
        [Description("One model id. Omit to rebuild every model in the library.")] int? modelId = null,
        [Description("Optional batch id, grouping this with related writes.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            // modelId, not `modelId ?? 0`: a library-wide reindex has no asset, and the
            // audit log validates "greater than 0 when provided" - so the zero threw
            // ArgumentException and made the whole-library form, the documented default,
            // impossible to call.
            new AgentWrite(idempotencyKey, "reindex-search", "Model", modelId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(new ReprojectSearchDocumentsCommand(modelId), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new
                    {
                        status = "ok",
                        scope = modelId is null ? "library" : "model",
                        reprojected = result.Value.Reprojected,
                        documentsWritten = result.Value.DocumentsWritten,
                        skipped = result.Value.Skipped,
                        notes = result.Value.Notes,
                    },
                    "Model", modelId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "import_model")]
    [Description("Import a model. Co-located: pass a server-readable file `path` and it is imported. Remote (client != server): omit `path` to get the HTTP upload endpoints to stream bytes to (control plane here, data plane over HTTP).")]
    public static async Task<object> ImportModel(
        ICommandHandler<AddModelCommand, AddModelCommandResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        IAgentUploadTickets tickets,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Absolute path to a model file readable by the SERVER (co-located import). Omit for remote upload instructions.")] string? path = null,
        [Description("Optional model name (defaults to the file name).")] string? name = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        // Remote case: bytes must travel over HTTP, so hand back an upload ticket rather
        // than a bare URL. The ticket carries this call's idempotency key, batch and actor
        // across to the data plane, which is what makes a remote import audited and
        // apply-once - previously the tool stepped out here and the upload arrived as an
        // anonymous POST with neither guarantee.
        //
        // Field names and a worked example travel with it. The obvious reading of
        // "POST /models/multifile (loose .gltf + external .bin)" is "post the files", which
        // 400s: the real contract pairs each file with the URI it is referenced by, and an
        // agent gets one guess before it burns a turn.
        if (string.IsNullOrWhiteSpace(path))
        {
            var denied = caller.Denied(McpScope.Write);
            if (denied is not null)
            {
                return denied;
            }

            var ticket = await tickets.IssueAsync(
                idempotencyKey, "import-model", AgentAssetFamilies.Model, caller.Actor, batchId, cancellationToken);

            return new
            {
                status = "upload-required",
                message = "The MCP server can't read a client-side path. Stream the file to the HTTP data plane with the ticket header below, then finalise with set_category / add_to_pack.",
                ticket = new
                {
                    header = AgentUploadTicketFilter.TicketHeader,
                    value = ticket.Secret,
                    expiresAt = ticket.ExpiresAt,
                    note = "Single use, and bound to this call's idempotencyKey - the upload is audited under it, and a repeat of an upload that already landed is answered 'already-applied' instead of importing twice.",
                },
                single = McpUploadContracts.Describe(McpUploadContracts.Targets[AgentAssetFamilies.Model]),
                // The routes a model may need INSTEAD of POST /models, handed over unasked.
                alternatives = McpUploadContracts.ModelAlternatives,
            };
        }

        return await Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "import-model", "Model", BatchId: batchId),
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

                // Import is content-addressed, so a file already in the library returns the
                // model that was there. This call then created nothing, and recording it as
                // an ordinary import would make its "undo" a soft delete of a model the
                // agent never imported - reversing one duplicate call would recycle the
                // user's original. The flag is written into the payload the reverser reads,
                // which is what makes such an entry report "nothing to undo" instead.
                return Applied(
                    new { status = "ok", modelId = result.Value.Id, alreadyExists = result.Value.AlreadyExists },
                    AgentAssetFamilies.Model,
                    result.Value.Id,
                    new { modelId = result.Value.Id, alreadyExisted = result.Value.AlreadyExists });
            },
            cancellationToken);
    }

}
