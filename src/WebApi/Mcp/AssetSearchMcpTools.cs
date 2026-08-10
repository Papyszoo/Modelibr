using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Extraction;
using Application.Extraction.Compute;
using Application.Search;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Local MCP tools exposing the asset library to an agent. A <b>thin pass-through</b>
/// over the ordinary query handlers (prompts 23–25) — no extraction or search logic
/// lives here. Read-only: agent writes are deliberately out of scope. Search logging
/// (prompt 24) covers these queries too, since they route through the same handler.
/// </summary>
[McpServerToolType]
public sealed class AssetSearchMcpTools
{
    [McpServerTool(Name = "search_assets")]
    [Description("Search the asset library with full-text + fuzzy identifier matching and structural filters. " +
                 "Returns ranked hits (current version only, prominence-aware) each with a deterministic browse summary.")]
    public static async Task<object> SearchAssets(
        IQueryHandler<AssetSearchQuery, AssetSearchResponse> handler,
        [Description("Free-text query (asset/part names, tokens, prose).")] string query,
        [Description("Max results (1-100).")] int limit = 25,
        [Description("Include secondary parts (reachable only when explicitly targeted).")] bool includeSecondary = false,
        [Description("Minimum triangle count filter.")] int? minTriangles = null,
        [Description("Maximum triangle count filter.")] int? maxTriangles = null,
        [Description("Only assets with (true) / without (false) animations.")] bool? hasAnimations = null,
        [Description("Shape class filter: planar | tall | wide | blocky.")] string? shapeClass = null,
        [Description("Engine filter: Unity | Unreal | Godot | ...")] string? engine = null,
        [Description("Asset type filter, e.g. Model.")] string? assetType = null,
        [Description("Minimum size: largest world bounding-box dimension, in metres.")] double? minSize = null,
        [Description("Maximum size: largest world bounding-box dimension, in metres.")] double? maxSize = null,
        [Description("Only rigged (true) / unrigged (false) assets.")] bool? hasRig = null,
        [Description("Minimum bone count.")] int? minBones = null,
        [Description("Maximum bone count.")] int? maxBones = null,
        [Description("Minimum material count.")] int? minMaterials = null,
        [Description("Maximum material count.")] int? maxMaterials = null,
        [Description("Only assets with (true) / without (false) UVs.")] bool? hasUvs = null,
        [Description("Minimum mesh/part count.")] int? minParts = null,
        [Description("Maximum mesh/part count.")] int? maxParts = null,
        [Description("Minimum vertex count.")] int? minVertices = null,
        [Description("Maximum vertex count.")] int? maxVertices = null,
        [Description("Category filter: matches the assigned category name (partial, case-insensitive), e.g. 'weapon'.")] string? category = null,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new AssetSearchQuery(query, limit, includeSecondary, minTriangles, maxTriangles,
                hasAnimations, shapeClass, engine, assetType,
                minSize, maxSize, hasRig, minBones, maxBones, minMaterials, maxMaterials,
                hasUvs, minParts, maxParts, minVertices, maxVertices, category),
            cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { hits = result.Value.Hits, totalCount = result.Value.TotalCount };
    }

    [McpServerTool(Name = "get_asset")]
    [Description("Get the derived metadata and part list for an asset's current version.")]
    public static async Task<object> GetAsset(
        IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse> handler,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetAssetMetadataQuery(assetType, assetId), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    [McpServerTool(Name = "get_part")]
    [Description("Get a single part's detail (by its part-path identifier) plus the parent asset's derived metadata.")]
    public static async Task<object> GetPart(
        IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse> handler,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("Part path (from the scene-graph part-path scheme).")] string partPath,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetAssetMetadataQuery(assetType, assetId, partPath), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    [McpServerTool(Name = "compute_on_demand")]
    [Description("Return a cached expensive-compute metric (UV overlap, texel density, per-part render, ...) for a geometry hash, " +
                 "or 'pending' if it has not been computed yet. Results are cached and shared across every asset with the same geometry.")]
    public static async Task<object> ComputeOnDemand(
        IQueryHandler<GetComputeResultQuery, ComputeResultResponse> handler,
        [Description("Order-invariant geometry hash of the target part.")] string geometryHash,
        [Description("Metric name: uv-overlap | texel-density | surface-area | manifold | part-render.")] string metric,
        [Description("Geometry hash version (defaults to 1).")] int hashVersion = 1,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new GetComputeResultQuery(geometryHash, hashVersion, metric), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { status = result.Value.Status, result = result.Value.Result };
    }

    [McpServerTool(Name = "list_facets")]
    [Description("List the structural filters search_assets accepts, so filters can be composed without guessing.")]
    public static object ListFacets() => new
    {
        filters = new object[]
        {
            new { name = "minTriangles / maxTriangles", type = "integer range", appliesTo = "Model" },
            new { name = "minVertices / maxVertices", type = "integer range", appliesTo = "Model" },
            new { name = "minParts / maxParts", type = "integer range", note = "mesh/part count (complexity)" },
            new { name = "minSize / maxSize", type = "number range", note = "largest world bounding-box dimension, metres" },
            new { name = "hasAnimations", type = "boolean", appliesTo = "Model" },
            new { name = "hasRig", type = "boolean", note = "has a skeleton (bone count > 0)" },
            new { name = "minBones / maxBones", type = "integer range", appliesTo = "Model" },
            new { name = "minMaterials / maxMaterials", type = "integer range", appliesTo = "Model" },
            new { name = "hasUvs", type = "boolean", appliesTo = "Model" },
            new { name = "shapeClass", type = "enum", values = new[] { "planar", "tall", "wide", "blocky" } },
            new { name = "engine", type = "enum", values = new[] { "Unity", "Unreal", "Godot", "Roblox", "Defold", "LÖVE" } },
            new { name = "category", type = "string", note = "matches the assigned category name (partial, case-insensitive); conceptual terms (weapon/animal/building) also hit via the free-text query" },
            new { name = "assetType", type = "enum", values = new[] { "Model" } },
            new { name = "includeSecondary", type = "boolean", note = "surface secondary-prominence parts" },
        },
    };
}
