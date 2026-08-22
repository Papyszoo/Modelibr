using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Extraction;
using Application.Extraction.Compute;
using Application.Search;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Local MCP tools exposing the asset library to an agent. A <b>thin pass-through</b>
/// over the ordinary query handlers (prompts 23–25) - no extraction or search logic
/// lives here. Read-only: agent writes are deliberately out of scope. Search logging
/// (prompt 24) covers these queries too, since they route through the same handler.
/// </summary>
[McpServerToolType]
public sealed class AssetSearchMcpTools
{
    [McpServerTool(Name = "search_assets")]
    [Description("Search the asset library with full-text + fuzzy identifier matching and structural filters. " +
                 "Returns ranked hits (current version only, prominence-aware) each with a deterministic browse summary. " +
                 "Assets holding identical geometry are collapsed into one hit; the ids folded into it are listed as `alsoAt`.")]
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
        [Description("Minimum size: longest axis in real-world metres. Check each hit's facts.scaleConvention - " +
                     "a 'normalized' asset was scaled into a unit box, so its size is a preview artefact, not a measurement.")]
        double? minSize = null,
        [Description("Maximum size: longest axis in real-world metres. See minSize regarding scaleConvention.")]
        double? maxSize = null,
        [Description("Only rigged (true) / unrigged (false) assets.")] bool? hasRig = null,
        [Description("Minimum bone count.")] int? minBones = null,
        [Description("Maximum bone count.")] int? maxBones = null,
        [Description("Minimum material count.")] int? minMaterials = null,
        [Description("Maximum material count.")] int? maxMaterials = null,
        [Description("Only assets with (true) / without (false) UVs. Note this is a weaker test than uvStatus: " +
                     "a palette-atlas model reports true here and still cannot receive a baked texture set.")] bool? hasUvs = null,
        [Description("UV layout filter - which assets can take a bake as they stand. " +
                     "unwrapped: UVs cover at least half of their own 0-1 space, bakeable now. " +
                     "atlas_packed: UVs are real but squeezed under 50% of the space, sharing a palette or atlas " +
                     "texture with other models - there is no texel budget to bake into, so unwrap first. " +
                     "tiled: UVs run outside 0-1 (tiling texture or trim sheet), which also cannot take a bake. " +
                     "partial: some meshes have UVs and some do not. no_uvs: none do.")]
        string? uvStatus = null,
        [Description("Minimum mesh/part count.")] int? minParts = null,
        [Description("Maximum mesh/part count.")] int? maxParts = null,
        [Description("Minimum vertex count.")] int? minVertices = null,
        [Description("Maximum vertex count.")] int? maxVertices = null,
        [Description("Category filter: matches the assigned category name (partial, case-insensitive), e.g. 'weapon'.")] string? category = null,
        [Description("Keep only assets carrying at least one of these styles, e.g. ['Low Poly']. Values come from the asset metadata schema - call get_metadata_schema for the list.")] string[]? styles = null,
        [Description("Keep only assets carrying at least one of these themes, e.g. ['Sci-Fi']. Schema values, as above.")] string[]? themes = null,
        [Description("Keep only assets under this licence, e.g. 'CC0'. Exact match on the schema's licence vocabulary.")] string? license = null,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new AssetSearchQuery(query, limit, includeSecondary, minTriangles, maxTriangles,
                hasAnimations, shapeClass, engine, assetType,
                minSize, maxSize, hasRig, minBones, maxBones, minMaterials, maxMaterials,
                hasUvs, uvStatus, minParts, maxParts, minVertices, maxVertices, category,
                styles, themes, license),
            cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { hits = result.Value.Hits, totalCount = result.Value.TotalCount };
    }

    [McpServerTool(Name = "get_asset")]
    [Description("Get the derived metadata, part list and material slot names for an asset. " +
                 "Pass the versionId from the search hit you are inspecting: without it this answers " +
                 "about the asset's active version, which is not necessarily the version that hit named.")]
    public static async Task<object> GetAsset(
        IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse> handler,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("Version to inspect - use the search hit's versionId. Defaults to the active version.")] int? versionId = null,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new GetAssetMetadataQuery(assetType, assetId, VersionId: versionId), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    [McpServerTool(Name = "get_part")]
    [Description("Get a single part's detail (by its part-path identifier) plus the parent asset's derived metadata. " +
                 "Pass the versionId from the search hit that named this part - part paths are only stable within a version.")]
    public static async Task<object> GetPart(
        IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse> handler,
        [Description("Asset family, e.g. Model.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("Part path (from the scene-graph part-path scheme).")] string partPath,
        [Description("Version to inspect - use the search hit's versionId. Defaults to the active version.")] int? versionId = null,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new GetAssetMetadataQuery(assetType, assetId, partPath, versionId), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    /// <summary>
    /// Metrics that are NOT a function of the geometry alone, and so can never be answered
    /// from a geometry-hash-keyed cache.
    /// </summary>
    /// <remarks>
    /// The hash is blind to UVs on purpose - it is what lets every copy of a mesh share one
    /// answer. A model and its re-baked version therefore hash identically while carrying
    /// completely different UV layouts, so a cached UV metric would be served to a mesh it
    /// was never measured on. Saying so beats answering "pending" forever, which is what
    /// this tool did until 2026-08-18: an answer that never arrives, with no way to tell
    /// that from one that simply had not been computed yet.
    /// </remarks>
    private static readonly Dictionary<string, string> PerLayoutMetrics = new(StringComparer.OrdinalIgnoreCase)
    {
        ["uv-overlap"] = "UV overlap",
        ["texel-density"] = "texel density"
    };

    [McpServerTool(Name = "compute_on_demand")]
    [Description("Return a cached expensive-compute metric (exact surface area, manifold check, per-part render, ...) for a geometry hash, " +
                 "or 'pending' if it has not been computed yet. Results are cached and shared across every asset with the same geometry. " +
                 "Queue the computation with analyze_meshes. UV overlap and texel density are NOT available here - they depend on the UV layout, " +
                 "which the geometry hash ignores; analyze_meshes returns those on the job itself.")]
    public static async Task<object> ComputeOnDemand(
        IQueryHandler<GetComputeResultQuery, ComputeResultResponse> handler,
        [Description("Order-invariant geometry hash of the target part.")] string geometryHash,
        [Description("Metric name: surface-area | manifold | part-render.")] string metric,
        [Description("Geometry hash version (defaults to 1).")] int hashVersion = 1,
        CancellationToken cancellationToken = default)
    {
        if (PerLayoutMetrics.TryGetValue(metric?.Trim() ?? string.Empty, out var friendly))
        {
            return new
            {
                status = "unavailable",
                message = $"{friendly} depends on the UV layout, and this cache is keyed by geometry hash - " +
                          "which is blind to UVs so that every copy of a mesh can share one answer. A model and its " +
                          "re-baked version hash identically and have entirely different layouts, so a cached value here " +
                          "would be wrong for one of them.",
                instead = "Run analyze_meshes(modelId) and read uvOverlap / texelDensity off the job result, per mesh.",
            };
        }

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
            new { name = "minSize / maxSize", type = "number range", note = "longest axis in real-world metres; every hit also carries facts.dimensions {x,y,z} and facts.scaleConvention (authored | normalized), so a preview-sized asset is not mistaken for a real one" },
            new { name = "hasAnimations", type = "boolean", appliesTo = "Model" },
            new { name = "hasRig", type = "boolean", note = "has a skeleton (bone count > 0)" },
            new { name = "minBones / maxBones", type = "integer range", appliesTo = "Model" },
            new { name = "minMaterials / maxMaterials", type = "integer range", appliesTo = "Model" },
            new { name = "hasUvs", type = "boolean", appliesTo = "Model", note = "presence only; use uvStatus to tell an atlas-packed asset from a bakeable one" },
            new
            {
                name = "uvStatus",
                type = "enum",
                values = new[] { "unwrapped", "atlas_packed", "tiled", "partial", "no_uvs" },
                note = "how the UVs are laid out, and so whether the asset can receive a baked texture set as it stands: " +
                       "unwrapped covers >=50% of its own 0-1 space; atlas_packed has real UVs squeezed under 50% because it " +
                       "shares a palette/atlas texture; tiled runs outside 0-1; partial means only some meshes have UVs. " +
                       "atlas_packed and tiled both need generate_uvs before bake_textures. Also returned on every hit as facts.uvStatus",
            },
            new { name = "shapeClass", type = "enum", values = new[] { "planar", "tall", "wide", "blocky" } },
            new { name = "engine", type = "enum", values = new[] { "Unity", "Unreal", "Godot", "Roblox", "Defold", "LÖVE" } },
            new { name = "category", type = "string", note = "matches the assigned category name (partial, case-insensitive); conceptual terms (weapon/animal/building) also hit via the free-text query" },
            new
            {
                name = "styles",
                type = "enum list",
                values = Application.Metadata.AssetMetadataSchema.Styles,
                note = "any-of. What the asset LOOKS like, from the asset metadata schema - a typed facet, not a tag, so a project brief that says Low Poly can actually filter on it. Also returned on every hit as facts.styles",
            },
            new
            {
                name = "themes",
                type = "enum list",
                values = Application.Metadata.AssetMetadataSchema.Themes,
                note = "any-of. What world the asset belongs to. Also returned as facts.themes",
            },
            new
            {
                name = "license",
                type = "enum",
                values = Application.Metadata.AssetMetadataSchema.Licenses,
                note = "exact. Populated by store imports and by set_asset_metadata; absent on assets nobody has said anything about, so filtering on it also excludes everything unlabelled",
            },
            // Deliberately still Model-only. Materials are not in this index and saying
            // they were would be worse than the gap: they carry no geometry, no parts and
            // no version, so every filter above is meaningless for them. Browse them with
            // list_materials instead, which reads the material library directly.
            new { name = "assetType", type = "enum", values = new[] { "Model" }, note = "materials are browsed with list_materials, not here - they have none of the geometry facets above" },
            new { name = "includeSecondary", type = "boolean", note = "surface secondary-prominence parts" },
        },
    };
}
