using Application.Abstractions.Messaging;

namespace Application.Search;

/// <summary>
/// Structured search over the derived-layer projection — the payoff the MCP server
/// (prompt 27) wraps. Lexical ranking (tokenised names beat substring hits) plus
/// composable structural filters, scoped to the current version, honouring
/// prominence. Distinct from <see cref="GlobalSearchQuery"/> (the incremental
/// name-only palette), which keeps working unchanged.
/// </summary>
public record AssetSearchQuery(
    string Term,
    int Limit = 25,
    bool IncludeSecondary = false,
    int? MinTriangles = null,
    int? MaxTriangles = null,
    bool? HasAnimations = null,
    string? ShapeClass = null,
    string? Engine = null,
    string? AssetType = null,
    // prompt-29 attribute filters
    double? MinSize = null,
    double? MaxSize = null,
    bool? HasRig = null,
    int? MinBones = null,
    int? MaxBones = null,
    int? MinMaterials = null,
    int? MaxMaterials = null,
    bool? HasUvs = null,
    int? MinParts = null,
    int? MaxParts = null,
    int? MinVertices = null,
    int? MaxVertices = null,
    // prompt-29 category bridge
    string? Category = null) : IQuery<AssetSearchResponse>;

public record AssetSearchResponse(IReadOnlyList<AssetSearchHit> Hits, int TotalCount);

public record AssetSearchHit(
    string AssetType,
    int AssetId,
    int? VersionId,
    string? PartPath,
    string DisplayName,
    string BrowseSummary,
    string Prominence,
    string MatchedOn);

/// <summary>Filters passed to the repository (mirrors the query's structural facets).</summary>
public record AssetSearchRequest(
    string Term,
    int Limit,
    bool IncludeSecondary,
    int? MinTriangles,
    int? MaxTriangles,
    bool? HasAnimations,
    string? ShapeClass,
    string? Engine,
    string? AssetType,
    double? MinSize = null,
    double? MaxSize = null,
    bool? HasRig = null,
    int? MinBones = null,
    int? MaxBones = null,
    int? MinMaterials = null,
    int? MaxMaterials = null,
    bool? HasUvs = null,
    int? MinParts = null,
    int? MaxParts = null,
    int? MinVertices = null,
    int? MaxVertices = null,
    string? Category = null);
