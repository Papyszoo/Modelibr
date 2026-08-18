using Application.Abstractions.Messaging;

namespace Application.Search;

/// <summary>
/// Structured search over the derived-layer projection - the payoff the MCP server
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
    /// <summary>
    /// UV layout: one of <c>unwrapped</c>, <c>atlas_packed</c>, <c>tiled</c>,
    /// <c>partial</c>, <c>no_uvs</c>. See <see cref="UvStatusClassifier"/>.
    /// </summary>
    string? UvStatus = null,
    int? MinParts = null,
    int? MaxParts = null,
    int? MinVertices = null,
    int? MaxVertices = null,
    // prompt-29 category bridge
    string? Category = null) : IQuery<AssetSearchResponse>;

public record AssetSearchResponse(IReadOnlyList<AssetSearchHit> Hits, int TotalCount);

/// <summary>
/// One candidate: always the whole asset, plus - when the query matched a mesh inside it -
/// the evidence that led there.
/// </summary>
/// <remarks>
/// The identity and facts on a hit describe the <b>placeable</b> thing, because
/// <c>place_asset</c> places an asset and has no way to place a part. Search ranks parts as
/// well as assets, so the best-ranked document for a hit is often a mesh: a query for
/// "carpet" can land on a carpet mesh inside a large sample scene. Naming that hit "carpet"
/// and handing back the carpet's triangle count and bounds - as this did - described
/// something the caller could not place, while <c>place_asset</c> would drop the entire
/// sample scene into the scene. The part is real information and stays, but it is reported
/// as <paramref name="MatchedPart"/>: evidence about why this asset came back, never as the
/// asset itself.
/// </remarks>
/// <param name="MatchedPart">
/// The part whose text actually matched, or null when the asset itself did. Its facts are
/// the part's own, so a caller can see how much of the asset the match accounts for.
/// </param>
/// <param name="AlsoAt">
/// Other asset ids holding the same geometry as this one, collapsed out of the results so
/// they do not occupy a caller's slots twice. Empty when the asset is unique, or when it
/// carries no geometry fingerprint to compare.
/// </param>
public record AssetSearchHit(
    string AssetType,
    int AssetId,
    int? VersionId,
    string? PartPath,
    string DisplayName,
    string BrowseSummary,
    string Prominence,
    string MatchedOn,
    AssetSearchFacts? Facts = null,
    MatchedPartView? MatchedPart = null,
    IReadOnlyList<int>? AlsoAt = null);

/// <summary>
/// The mesh inside an asset that a query matched. Distinct from the hit itself so the two
/// can never be confused: this is not placeable.
/// </summary>
public record MatchedPartView(
    string PartPath,
    string DisplayName,
    string BrowseSummary,
    string Prominence,
    AssetSearchFacts? Facts = null);

/// <summary>
/// The structural facts a caller needs to <i>choose between</i> hits, returned inline.
///
/// Without these, picking one of ten candidates costs ten extra <c>get_asset</c> calls -
/// the dominant cost in an agent assembling a scene, where every filter it wants to apply
/// (triangle budget, physical size, is it rigged, does it have UVs) is already sitting in
/// the search document that produced the hit.
/// </summary>
/// <param name="Dimensions">
/// The asset's real extent in metres, per axis. Present so choosing something the right size
/// does not require placing it first - reading real dimensions used to mean a write
/// (<c>place_asset</c>) or a <c>get_scene</c>, i.e. one throwaway placement per candidate.
/// </param>
/// <param name="ScaleConvention">
/// <c>authored</c> when <paramref name="Dimensions"/> are real-world size, <c>normalized</c>
/// when the asset was scaled into a unit box and its size is a preview artefact, null when
/// there are no bounds to judge. Without it a 2 m armchair and a 2 m wrench read identically.
/// </param>
public record AssetSearchFacts(
    int? TriangleCount,
    int? VertexCount,
    int? PartCount,
    int? MaterialCount,
    double? MaxDimension,
    bool? HasUvs,
    bool HasRig,
    int? BoneCount,
    bool? HasAnimations,
    int? AnimationCount,
    string? ShapeClass,
    string? CategoryName,
    AssetDimensions? Dimensions = null,
    string? ScaleConvention = null,
    /// <summary>
    /// How the UVs are laid out - <c>unwrapped</c>, <c>atlas_packed</c>, <c>tiled</c>,
    /// <c>partial</c>, <c>no_uvs</c>, or null when it could not be measured.
    ///
    /// Returned inline beside <c>HasUvs</c> because the two disagree exactly where it
    /// matters: an atlas-packed asset reports UVs and still cannot take a bake, so an agent
    /// choosing something to texture needs this to tell "ready" from "needs an unwrap first"
    /// without a round trip per candidate.
    /// </summary>
    string? UvStatus = null);

/// <summary>An asset's extent in metres. Null axes mean it was never measured.</summary>
public record AssetDimensions(double? X, double? Y, double? Z);

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
    string? UvStatus = null,
    int? MinParts = null,
    int? MaxParts = null,
    int? MinVertices = null,
    int? MaxVertices = null,
    string? Category = null);
