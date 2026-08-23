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
                 "Assets holding identical geometry are collapsed into one hit; the ids folded into it are listed as `alsoAt`. " +
                 "Pass projectId (or sceneId) to search on behalf of a project: its style ranks the results and its triangle " +
                 "budget is reported on each hit as facts.profileFit. The response's `profile` block always says what was applied.")]
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
        [Description("Search for this project: its styles rank the results and its triangle budget rides along on every hit. " +
                     "Read the brief first with get_project - the profile explains what the ranking is doing.")] int? projectId = null,
        [Description("Search for this scene's project. A shortcut for looking the project up yourself; a scene that belongs to " +
                     "no project applies no profile, and the response says so rather than failing.")] int? sceneId = null,
        [Description("How much of the project's profile to apply. " +
                     "bias (default): style ranks the results, the budget is reported per hit and nothing is removed. " +
                     "enforce: the triangle budget also becomes a filter, and the response says how many assets it removed. " +
                     "off: ordinary search. Only meaningful with projectId or sceneId.")] string? applyProfile = null,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new AssetSearchQuery(query, limit, includeSecondary, minTriangles, maxTriangles,
                hasAnimations, shapeClass, engine, assetType,
                minSize, maxSize, hasRig, minBones, maxBones, minMaterials, maxMaterials,
                hasUvs, uvStatus, minParts, maxParts, minVertices, maxVertices, category,
                styles, themes, license, projectId, sceneId, applyProfile),
            cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new
            {
                hits = result.Value.Hits,
                totalCount = result.Value.TotalCount,
                // Always returned when a profile was asked for, including when it was not
                // applied. A ranking the caller cannot see is one it cannot argue with.
                profile = result.Value.Profile,
            };
    }

    /// <summary>
    /// One question in a batch of them. Deliberately a small subset of <c>search_assets</c>'s
    /// arguments: a batch is for asking ten similar questions at once, and a per-entry copy
    /// of thirty filters would be a second search contract to keep in step with the first.
    /// </summary>
    public sealed record SearchRequest(
        [property: Description("Free-text query for this entry.")] string Query,
        [property: Description("Your own label for this entry, echoed back so you can match answers to questions. Defaults to the query.")] string? Label = null,
        [property: Description("Max results for this entry (1-100). Falls back to the call's limit.")] int? Limit = null,
        [property: Description("Asset type filter for this entry, e.g. Model.")] string? AssetType = null,
        [property: Description("Minimum triangle count for this entry.")] int? MinTriangles = null,
        [property: Description("Maximum triangle count for this entry.")] int? MaxTriangles = null,
        [property: Description("Minimum size for this entry: longest axis in metres.")] double? MinSize = null,
        [property: Description("Maximum size for this entry: longest axis in metres.")] double? MaxSize = null,
        [property: Description("Category filter for this entry.")] string? Category = null);

    [McpServerTool(Name = "search_many")]
    [Description("Run several searches in ONE call. A scene brief is a batch of questions - a sofa, a coffee table, a rug, " +
                 "two lamps - and asking them one at a time is one round trip each, every one of them re-entering your context. " +
                 "Each entry gets its own query and optional filters; projectId/sceneId and applyProfile are set once for the " +
                 "whole call, because a brief is searched on behalf of one project. " +
                 "Answers come back in request order, each with your own label, so nothing has to be matched up by guessing. " +
                 "An entry that fails does not fail the batch - it comes back with its own error and the others still answer.")]
    public static async Task<object> SearchMany(
        IQueryHandler<AssetSearchQuery, AssetSearchResponse> handler,
        [Description("The searches to run. Two to twenty is the useful range.")] SearchRequest[] searches,
        [Description("Default max results per entry (1-100).")] int limit = 10,
        [Description("Search every entry on behalf of this project: its style ranks the results and its budget rides along.")] int? projectId = null,
        [Description("Search on behalf of this scene's project. A shortcut for looking the project up yourself.")] int? sceneId = null,
        [Description("How much of the project's profile to apply: bias (default), enforce or off.")] string? applyProfile = null,
        CancellationToken cancellationToken = default)
    {
        var entries = searches ?? [];

        if (entries.Length == 0)
        {
            return new { error = "EmptyBatch", message = "searches is empty; pass at least one query." };
        }

        if (entries.Length > MaxBatchedSearches)
        {
            return new
            {
                error = "TooManySearches",
                message = $"searches has {entries.Length} entries; at most {MaxBatchedSearches} run in one call. Split the brief.",
            };
        }

        var results = new List<object>(entries.Length);

        for (var index = 0; index < entries.Length; index++)
        {
            var entry = entries[index];
            var label = entry.Label ?? entry.Query;

            var result = await handler.Handle(
                new AssetSearchQuery(
                    entry.Query,
                    entry.Limit ?? limit,
                    AssetType: entry.AssetType,
                    MinTriangles: entry.MinTriangles,
                    MaxTriangles: entry.MaxTriangles,
                    MinSize: entry.MinSize,
                    MaxSize: entry.MaxSize,
                    Category: entry.Category,
                    ProjectId: projectId,
                    SceneId: sceneId,
                    ApplyProfile: applyProfile),
                cancellationToken);

            // One bad entry does not lose the nine good answers. A batch that failed whole
            // would make the batching worse than the loop it replaces.
            results.Add(result.IsFailure
                ? new { index, label, query = entry.Query, error = result.Error.Code, message = result.Error.Message }
                : new
                {
                    index,
                    label,
                    query = entry.Query,
                    hits = (object)result.Value.Hits,
                    totalCount = result.Value.TotalCount,
                    profile = result.Value.Profile,
                });
        }

        return new { searches = results, count = results.Count };
    }

    /// <summary>Cap on one batched read. Twenty is more questions than any one brief has.</summary>
    private const int MaxBatchedSearches = 20;

    /// <summary>One asset to look up in a batch.</summary>
    public sealed record AssetRequest(
        [property: Description("Asset family, e.g. Model.")] string AssetType,
        [property: Description("Asset id.")] int AssetId,
        [property: Description("Version to inspect - use the search hit's versionId. Defaults to the active version.")] int? VersionId = null);

    [McpServerTool(Name = "get_assets")]
    [Description("Get the derived metadata, parts and material slots for SEVERAL assets in one call. " +
                 "Use this after a search rather than one get_asset per hit: comparing ten candidates was ten round trips. " +
                 "Pass each hit's versionId, or you get answers about whatever version is active rather than the one you saw. " +
                 "Answers come back in request order; one that cannot be read carries its own error and the rest still answer.")]
    public static async Task<object> GetAssets(
        IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse> handler,
        [Description("The assets to look up.")] AssetRequest[] assets,
        CancellationToken cancellationToken = default)
    {
        var entries = assets ?? [];

        if (entries.Length == 0)
        {
            return new { error = "EmptyBatch", message = "assets is empty; pass at least one asset." };
        }

        if (entries.Length > MaxBatchedAssets)
        {
            return new
            {
                error = "TooManyAssets",
                message = $"assets has {entries.Length} entries; at most {MaxBatchedAssets} are read in one call.",
            };
        }

        var results = new List<object>(entries.Length);

        for (var index = 0; index < entries.Length; index++)
        {
            var entry = entries[index];
            var result = await handler.Handle(
                new GetAssetMetadataQuery(entry.AssetType, entry.AssetId, VersionId: entry.VersionId),
                cancellationToken);

            results.Add(result.IsFailure
                ? new
                {
                    index,
                    assetType = entry.AssetType,
                    assetId = entry.AssetId,
                    error = result.Error.Code,
                    message = result.Error.Message,
                }
                : new { index, assetType = entry.AssetType, assetId = entry.AssetId, asset = (object)result.Value });
        }

        return new { assets = results, count = results.Count };
    }

    /// <summary>Cap on one batched metadata read, matching the search cap's intent.</summary>
    private const int MaxBatchedAssets = 50;

    [McpServerTool(Name = "get_asset")]
    [Description("Get the derived metadata, part list and material slot names for an asset. " +
                 "Pass the versionId from the search hit you are inspecting: without it this answers " +
                 "about the asset's active version, which is not necessarily the version that hit named. " +
                 "The response also carries `surfaces`: the horizontal faces something can be rested on, " +
                 "largest first, each with its HEIGHT ABOVE THE ASSET'S BASE and its extent. " +
                 "READ THESE BEFORE STACKING. place_asset(on:) rests a node on the target's whole-asset " +
                 "bounding-box top, which is right for a table and wrong for anything with structure - " +
                 "it puts a cushion on a sofa's BACK rather than its seat. Use the surface height to place " +
                 "the node yourself with an explicit position, or say so in the rationale when you stack anyway.")]
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

    [McpServerTool(Name = "get_index_status")]
    [Description("How much of the library is findable. USE THIS AFTER A BULK IMPORT rather than searching for something and guessing: " +
                 "an asset can be derived and still not indexed, in which case it exists and search cannot see it. " +
                 "Reports, per family, how many assets have a derived row, how many have a current search document, and how many were " +
                 "derived under an older projection. The `notes` say what the numbers do NOT mean - read them before concluding the " +
                 "library is ready. reindex_search rebuilds documents from stored derivations; trigger_rederive moves a stale row forward.")]
    public static async Task<object> GetIndexStatus(
        IQueryHandler<GetIndexStatusQuery, IndexStatusResponse> handler,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetIndexStatusQuery(), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
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
            new
            {
                name = "projectId / sceneId + applyProfile",
                type = "enum",
                values = Application.Search.AssetSearchProfileModes.All,
                note = "search on behalf of a project. bias (default) ranks by the project's style and reports its triangle " +
                       "budget on each hit as facts.profileFit; enforce also filters on the budget and reports how many assets " +
                       "that removed; off is ordinary search. Style tokens demote, they never exclude - the only hard filter " +
                       "here is the budget, and only under enforce",
            },
        },
    };
}
