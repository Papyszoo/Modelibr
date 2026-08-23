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
    string? Category = null,
    /// <summary>
    /// Keep only assets carrying at least one of these styles, from the asset metadata
    /// schema's vocabulary (<c>Low Poly</c>, <c>Realistic</c>, …). Any-of, not all-of: a
    /// brief that says "low poly or voxel" is one filter, not two searches.
    /// </summary>
    IReadOnlyList<string>? Styles = null,

    /// <summary>Keep only assets carrying at least one of these themes. Any-of, as above.</summary>
    IReadOnlyList<string>? Themes = null,

    /// <summary>
    /// Keep only assets under this licence. Exact match on a closed vocabulary - the point
    /// of the filter is "may I ship this", and a near-miss is the wrong answer.
    /// </summary>
    string? License = null,

    /// <summary>
    /// Search on behalf of this project: its style ranks results and its budget is reported
    /// (or, in <c>enforce</c>, applied). See <see cref="ApplyProfile"/>.
    /// </summary>
    int? ProjectId = null,

    /// <summary>
    /// Search on behalf of this scene's project. A convenience over <see cref="ProjectId"/> -
    /// an agent handed a scene id should not have to look its project up first. A scene that
    /// belongs to no project applies no profile, and the response says so.
    /// </summary>
    int? SceneId = null,

    /// <summary>
    /// How much of the resolved profile to apply: <c>off</c>, <c>bias</c> (the default when a
    /// project is resolved) or <c>enforce</c>. An unrecognised value is an error, never a
    /// silent fallback - the whole point of the parameter is that the caller knows which of
    /// the three it got.
    /// </summary>
    string? ApplyProfile = null) : IQuery<AssetSearchResponse>;

/// <param name="Profile">
/// What the project's profile did to this search, or null when none was resolved. Present
/// even in <c>bias</c>, where it changed only the order: a caller that cannot see the profile
/// cannot tell a ranking it disagrees with from one it never asked for.
/// </param>
public record AssetSearchResponse(
    IReadOnlyList<AssetSearchHit> Hits,
    int TotalCount,
    AssetSearchProfileView? Profile = null);

/// <summary>
/// The profile a search ran under, reported back on the response (prompt 13-D3).
/// </summary>
/// <param name="Applied">
/// False when a profile was asked for and none took effect - <c>applyProfile: "off"</c>, or a
/// scene that belongs to no project. <see cref="Note"/> says which.
/// </param>
/// <param name="RemovedByBudget">
/// How many otherwise-matching assets the enforced cap removed. Null in every other mode.
/// <b>An agent that gets three results has to be able to see that a cap it did not set is the
/// reason</b>, and relax it; a hard filter that does not say what it took out is the trap this
/// whole parameter exists to avoid.
/// </param>
public record AssetSearchProfileView(
    string Mode,
    bool Applied,
    int? ProjectId = null,
    string? ProjectName = null,
    IReadOnlyList<string>? Styles = null,
    int? TriangleCap = null,
    string? TriangleCapSource = null,
    int? RemovedByBudget = null,
    IReadOnlyList<string>? BoostTokens = null,
    IReadOnlyList<string>? PenaltyTokens = null,
    string? FamilyHint = null,
    string? Note = null);

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
    string? UvStatus = null,

    /// <summary>
    /// The asset's declared styles and themes, and its licence, from the metadata schema.
    /// Returned inline so a caller comparing candidates against a project's profile - or
    /// deciding whether it may ship one - does not need a follow-up read per hit.
    /// </summary>
    IReadOnlyList<string>? Styles = null,
    IReadOnlyList<string>? Themes = null,
    string? License = null,

    /// <summary>
    /// How this hit measures against the project the search ran for, or null when it ran for
    /// none. The numbers, not a verdict: an over-budget asset is still returned, still
    /// placeable, and still the right answer when the caller decides it is.
    /// </summary>
    AssetProfileFit? ProfileFit = null);

/// <summary>
/// One hit, measured against the project's profile (prompt 13-D3).
/// </summary>
/// <param name="Budget">The per-asset triangle cap the profile carries, or null when it sets none.</param>
/// <param name="WithinBudget">
/// Null when there is no cap, or when the asset has no triangles to compare - a sound is not
/// over a triangle budget, and saying it is would make the flag useless for the assets it is
/// about.
/// </param>
/// <param name="StyleSignals">Which of the project's style tokens this asset's text carries.</param>
/// <param name="Contradicts">
/// Which of the style's penalty tokens it carries. Reported so a candidate that violates the
/// profile can be proposed <i>and say so</i>, rather than being quietly dropped.
/// </param>
/// <param name="DeclaresProjectStyle">
/// True when the asset's own declared styles include one of the project's - the strongest
/// signal available, and the one the metadata schema exists to make possible.
/// </param>
public record AssetProfileFit(
    int? Triangles,
    int? Budget,
    bool? WithinBudget,
    IReadOnlyList<string> StyleSignals,
    IReadOnlyList<string> Contradicts,
    bool DeclaresProjectStyle);

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
    string? Category = null,
    IReadOnlyList<string>? Styles = null,
    IReadOnlyList<string>? Themes = null,
    string? License = null,
    ProfileSearchBias? Profile = null);
