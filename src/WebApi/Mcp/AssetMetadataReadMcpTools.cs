using System.ComponentModel;
using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Metadata;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Reading the asset metadata schema (prompt 16-C): the contract itself, and one asset's
/// values against it.
///
/// <para>
/// Reads, so they are registered unconditionally - an agent that can search the library can
/// see what the library knows about what it found. The matching write lives in
/// <see cref="AssetMetadataWriteMcpTools"/> behind the write flag.
/// </para>
/// </summary>
[McpServerToolType]
public sealed class AssetMetadataReadMcpTools
{
    [McpServerTool(Name = "get_metadata_schema")]
    [Description("The asset metadata schema: every field an asset can carry, per family, with its type, allowed values, where it is stored and which store-manifest path populates it. Read this before set_asset_metadata - it is the field list that call validates against.")]
    public static async Task<object> GetMetadataSchema(
        IQueryHandler<GetAssetMetadataSchemaQuery, AssetMetadataSchemaResponse> handler,
        [Description("One family (Model, TextureSet, Sprite, Sound, Material, EnvironmentMap). Omit for all of them.")] string? assetType = null,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetAssetMetadataSchemaQuery(assetType), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    [McpServerTool(Name = "get_asset_metadata")]
    [Description("Every schema field's current value for one asset - authored, imported and derived alike - plus `completeness`, which lists the fields a caller could still fill. Use it to find what an asset is missing rather than reading it and comparing by hand.")]
    public static async Task<object> GetAssetMetadata(
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> handler,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new ReadAssetMetadataQuery(assetType, assetId), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    [McpServerTool(Name = "get_import_suggestions")]
    [Description("What the import automation categorized and tagged on its own, and nobody has confirmed yet. Each entry says what it decided and what it decided it from (the folder). Settle them with review_import_suggestions.")]
    public static async Task<object> GetImportSuggestions(
        IQueryHandler<ImportSuggestionsQuery, ImportSuggestionsResponse> handler,
        [Description("1-based page (default 1).")] int page = 1,
        [Description("Entries per page, 1-200 (default 50).")] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new ImportSuggestionsQuery(page, pageSize), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }
}
