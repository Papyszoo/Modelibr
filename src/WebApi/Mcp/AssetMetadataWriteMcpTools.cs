using System.ComponentModel;
using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Metadata;
using ModelContextProtocol.Server;
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
    [Description("Merge schema fields onto an asset. `fields` is a JSON object of schema field keys to values: a key you omit is left alone, and a key set to null is cleared. Works for every asset family - the call resolves where each field lives. Idempotent per idempotencyKey and undoable with reverse_operation.")]
    public static Task<object> SetAssetMetadata(
        ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse> handler,
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> readHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("JSON object of schema field keys to values, e.g. {\"license\":\"CC0\",\"styles\":[\"Low Poly\"],\"author\":\"Kenney\"}. Call get_metadata_schema for the keys.")] JsonElement fields,
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
                if (fields.ValueKind != JsonValueKind.Object)
                {
                    return Failed(new
                    {
                        error = "InvalidMetadataPatch",
                        message = "`fields` must be a JSON object of schema field keys to values."
                    });
                }

                var patch = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
                foreach (var property in fields.EnumerateObject())
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
}
