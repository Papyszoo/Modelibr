using System.ComponentModel;
using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Metadata;
using Application.StoreImports;
using ModelContextProtocol.Server;
using WebApi.Infrastructure;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// Writing schema fields onto an asset (prompt 16-C). One family-agnostic call: the caller
/// names fields, and the write resolves whether each one lives on the asset's entity, in the
/// metadata side table, or in the facets bag.
/// </summary>
[McpServerToolType]
public sealed class AssetMetadataWriteMcpTools
{
    [McpServerTool(Name = "set_asset_metadata")]
    [Description("Merge schema fields onto an asset: `tags`, `description` and `category` (the category id, or null to clear) join licence, author, credit, style, theme and source. `fields` is a JSON object of schema field keys to values - a key you omit is left alone, and a key set to null is cleared. Works for every asset family: the call resolves where each field lives. Call get_metadata_schema for the field list. Idempotent per idempotencyKey and undoable with reverse_operation.")]
    public static Task<object> SetAssetMetadata(
        ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse> handler,
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> readHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("JSON object of schema field keys to values, e.g. {\"license\":\"CC0\",\"styles\":[\"Low Poly\"],\"author\":\"Kenney\"}. A JSON string holding that object is accepted too. Call get_metadata_schema for the keys.")] JsonElement fields,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "set-asset-metadata", assetType, assetId, BatchId: batchId),
            async ct =>
            {
                // `fields` is a JsonElement, which the schema generator cannot describe - it
                // emits no `type` for the parameter at all. Clients that must pick one send
                // the patch as a JSON *string*, so accept that shape as well: refusing it
                // left this tool uncallable from any such client.
                if (!TryReadPatch(fields, out var fieldsObject))
                {
                    return Failed(new
                    {
                        error = "InvalidMetadataPatch",
                        message = "`fields` must be a JSON object of schema field keys to values, "
                            + "or a JSON string holding one."
                    });
                }

                var patch = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
                foreach (var property in fieldsObject.EnumerateObject())
                {
                    patch[property.Name] = property.Value.Clone();
                }

                // Read before writing so the undo has the values being replaced. A metadata
                // write is a merge, so "before" is the only record of what the merged-over
                // fields held - and the read is the same one the response is built from,
                // which keeps the two shapes identical.
                var before = await readHandler.Handle(new ReadAssetMetadataQuery(assetType, assetId), ct);

                var result = await handler.Handle(
                    new SetAssetMetadataCommand(assetType, assetId, patch), ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", metadata = result.Value },
                    assetType,
                    assetId,
                    result.Value,
                    before.IsSuccess ? before.Value : null);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "annotate_asset")]
    [Description("Call this after actually looking at an asset (render or thumbnail) to record a visual description and alternative names/use cases as tags, improving discoverability. Never overwrites a description authored by a person, only gap-fills empty or auto-generated ones. Tags are merged additively without duplicates.")]
    public static Task<object> AnnotateAsset(
        ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse> handler,
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> readHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("What the asset looks like, in prose. Ignored when the asset already carries a description of its own (non-empty and not just its name).")] string? description,
        [Description("Alternative names and use cases, as tags. Merged onto the asset's existing tags case-insensitively, without duplicates.")] string[]? tags,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            // The change under this tool IS a metadata merge, so it records the operation the
            // undo surface already knows how to reverse rather than inventing a second name
            // for the same change.
            new AgentWrite(idempotencyKey, "set-asset-metadata", assetType, assetId, BatchId: batchId),
            async ct =>
            {
                var id = assetId;

                // Read first: the gap-fill rule needs what the asset already says, and the
                // same read is the "before" the undo restores.
                var before = await readHandler.Handle(new ReadAssetMetadataQuery(assetType, id), ct);
                if (before.IsFailure)
                {
                    return Failed(before.Error);
                }

                var current = before.Value;
                var currentDescription = FieldText(current, "description");
                var currentTags = FieldTags(current, "tags");

                var (descriptionToWrite, tagsToWrite) = StoreMetadataStampFields.GapFillDescriptiveMetadata(
                    current.Name, currentDescription, currentTags, description, tags);

                var resultingDescription = descriptionToWrite ?? currentDescription;
                var resultingTags = tagsToWrite ?? currentTags;

                // Nothing the asset's own state does not already say: report it, settle the
                // key, and write nothing. The recorded before and after are equal, so an undo
                // of this entry correctly finds no field to restore.
                if (descriptionToWrite is null && tagsToWrite is null)
                {
                    return Applied(
                        new
                        {
                            status = "unchanged",
                            descriptionWritten = false,
                            tagsWritten = false,
                            description = resultingDescription,
                            tags = resultingTags,
                        },
                        assetType,
                        id,
                        current,
                        current);
                }

                var patch = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
                if (descriptionToWrite is not null)
                {
                    patch["description"] = JsonSerializer.SerializeToElement(descriptionToWrite);
                }

                if (tagsToWrite is not null)
                {
                    patch["tags"] = JsonSerializer.SerializeToElement(tagsToWrite);
                }

                var result = await handler.Handle(new SetAssetMetadataCommand(assetType, id, patch), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new
                    {
                        status = "ok",
                        descriptionWritten = descriptionToWrite is not null,
                        tagsWritten = tagsToWrite is not null,
                        description = resultingDescription,
                        tags = resultingTags,
                    },
                    assetType,
                    id,
                    result.Value,
                    before.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "review_import_suggestions")]
    [Description("Settle what the import automation guessed, in bulk: accept=true keeps the categories and tags it applied, accept=false takes them back. Omit modelIds to settle everything waiting (bounded per call - repeat while `remaining` > 0). Taking back never undoes a decision a person made since: a category someone changed and a tag someone else added are left alone.")]
    public static Task<object> ReviewImportSuggestions(
        ICommandHandler<ReviewImportSuggestionsCommand, ReviewImportSuggestionsResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("True to keep the automation's guesses, false to take them back.")] bool accept = true,
        [Description("Which models to settle. Omit for every asset waiting.")] int[]? modelIds = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "review-import-suggestions", AgentAssetFamilies.Model, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new ReviewImportSuggestionsCommand(modelIds?.ToList(), accept), ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                // Deliberately no undo payload. Accepting changes nothing but a review
                // marker, and rejecting is itself the undo - reversing it would mean
                // re-applying guesses a person has just rejected.
                return Applied(
                    new
                    {
                        status = "ok",
                        reviewed = result.Value.Reviewed,
                        categoriesCleared = result.Value.CategoriesCleared,
                        tagsRemoved = result.Value.TagsRemoved,
                        remaining = result.Value.Remaining,
                    },
                    AgentAssetFamilies.Model,
                    null,
                    null);
            },
            cancellationToken);
    }

    /// <summary>
    /// Resolves the two shapes <c>fields</c> arrives in: a JSON object from a client that can
    /// send one, and a JSON string holding that object from a client that cannot. Anything
    /// else - including a string that does not parse, or parses to a non-object - is refused.
    /// </summary>
    private static bool TryReadPatch(JsonElement fields, out JsonElement patch)
    {
        if (fields.ValueKind == JsonValueKind.Object)
        {
            patch = fields;
            return true;
        }

        if (fields.ValueKind == JsonValueKind.String)
        {
            var raw = fields.GetString();
            if (!string.IsNullOrWhiteSpace(raw))
            {
                try
                {
                    using var parsed = JsonDocument.Parse(raw);
                    if (parsed.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        // Clone so the value outlives the JsonDocument being disposed here.
                        patch = parsed.RootElement.Clone();
                        return true;
                    }
                }
                catch (JsonException)
                {
                    // Falls through to the refusal below, which names both accepted shapes.
                }
            }
        }

        patch = default;
        return false;
    }

    /// <summary>One field's current text value, or null when it holds none.</summary>
    private static string? FieldText(AssetMetadataResponse metadata, string key)
        => metadata.Fields
            .FirstOrDefault(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase))
            ?.Value as string;

    /// <summary>One repeating field's current values, empty when it holds none.</summary>
    private static IReadOnlyList<string> FieldTags(AssetMetadataResponse metadata, string key)
        => metadata.Fields
            .FirstOrDefault(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase))
            ?.Value is IEnumerable<string> tags
                ? tags.ToList()
                : Array.Empty<string>();
}
