namespace Domain.Models;

/// <summary>
/// One searchable unit in the derived-layer search projection: either an asset
/// (PartPath = null) or one of its parts. Denormalised so search is a single
/// indexed table scan rather than a join across raw + derived rows.
///
/// Text is split by intent: <see cref="Tokens"/> and <see cref="Symbols"/> are
/// authored identifiers indexed <b>literally</b> (trigram, no stemming — so
/// <c>ściana</c>/<c>Wandhalterung</c> survive), while <see cref="BrowseSummary"/>
/// is prose for the full-text vector. <see cref="Prominence"/> keeps secondary
/// parts out of default results, and <see cref="IsCurrentVersion"/> keeps a
/// six-times-versioned model from returning six near-identical hits.
///
/// Documents are replaced wholesale per (AssetType, AssetId, VersionId) on
/// re-derive, so there are no in-place mutators.
/// </summary>
public class AssetSearchDocument
{
    public int Id { get; private set; }

    public string AssetType { get; private set; } = string.Empty;
    public int AssetId { get; private set; }
    public int? VersionId { get; private set; }

    /// <summary>Null for the asset-level document; the part path for a part document.</summary>
    public string? PartPath { get; private set; }

    public bool IsCurrentVersion { get; private set; }

    /// <summary>
    /// False while the underlying asset is in the recycle bin. Soft delete must hide an
    /// asset from search immediately, and restoring it must bring the asset back without
    /// waiting for a re-extraction — so deletion state is carried on the projection
    /// rather than left for the next derive to notice.
    /// </summary>
    public bool IsActive { get; private set; } = true;

    /// <summary>full / secondary / hidden (see the derived prominence layer).</summary>
    public string Prominence { get; private set; } = "full";

    public string DisplayName { get; private set; } = string.Empty;

    /// <summary>Space-joined authored tokens (top search weight), trigram-indexed.</summary>
    public string Tokens { get; private set; } = string.Empty;

    /// <summary>Space-joined declared script symbols (mesh-name weight), trigram-indexed.</summary>
    public string Symbols { get; private set; } = string.Empty;

    /// <summary>
    /// Space-joined deterministic concept labels (weapon / vehicle / building …) inferred
    /// from the authored tokens.
    ///
    /// Kept OUT of <see cref="Tokens"/> deliberately. When both lived in one field a
    /// concept match was indistinguishable from a name match, so a query for "vehicle"
    /// ranked <c>boat_ornament</c> and <c>tram_rail</c> — labelled vehicles — level with
    /// <c>SM_Veh_Car_Van_01</c>, and alphabetical tie-breaking then decided the page.
    /// Scored separately, concepts add recall without displacing an authored name.
    /// </summary>
    public string ConceptLabels { get; private set; } = string.Empty;

    /// <summary>Human-readable prose line for the full-text vector.</summary>
    public string BrowseSummary { get; private set; } = string.Empty;

    // ---- structural filters (nullable; populated where the family supplies them) ----
    public int? TriangleCount { get; private set; }
    public bool? HasAnimations { get; private set; }
    public int? BoneCount { get; private set; }
    public string? ShapeClass { get; private set; }
    public double? Tileability { get; private set; }
    public string? DurationClass { get; private set; }
    public string? Engine { get; private set; }
    public double? GridSize { get; private set; }
    public List<string> QualityFlags { get; private set; } = new();

    // ---- prompt-29 attribute filters (already-extracted facts, projected for search) ----
    public int? VertexCount { get; private set; }
    public int? MaterialCount { get; private set; }
    public bool? HasUvs { get; private set; }
    public int? PartCount { get; private set; }
    public int? AnimationCount { get; private set; }

    /// <summary>Largest world bounding-box dimension (metres) — the "how big" size filter.</summary>
    public double? MaxDimension { get; private set; }

    // ---- prompt-29 category bridge (the assigned user category, the semantic layer) ----
    public int? CategoryId { get; private set; }
    public string? CategoryName { get; private set; }

    public DateTime UpdatedAt { get; private set; }

    public static AssetSearchDocument Create(
        string assetType,
        int assetId,
        int? versionId,
        string? partPath,
        bool isCurrentVersion,
        string prominence,
        string displayName,
        string tokens,
        string browseSummary,
        DateTime updatedAt,
        string symbols = "",
        string conceptLabels = "",
        int? triangleCount = null,
        bool? hasAnimations = null,
        int? boneCount = null,
        string? shapeClass = null,
        double? tileability = null,
        string? durationClass = null,
        string? engine = null,
        double? gridSize = null,
        IEnumerable<string>? qualityFlags = null,
        int? vertexCount = null,
        int? materialCount = null,
        bool? hasUvs = null,
        int? partCount = null,
        int? animationCount = null,
        double? maxDimension = null,
        int? categoryId = null,
        string? categoryName = null,
        bool isActive = true)
    {
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or whitespace.", nameof(assetType));
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));
        if (versionId.HasValue && versionId.Value <= 0)
            throw new ArgumentException("Version id must be greater than 0 when provided.", nameof(versionId));

        return new AssetSearchDocument
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            VersionId = versionId,
            PartPath = string.IsNullOrWhiteSpace(partPath) ? null : partPath.Trim(),
            IsCurrentVersion = isCurrentVersion,
            IsActive = isActive,
            Prominence = string.IsNullOrWhiteSpace(prominence) ? "full" : prominence.Trim(),
            DisplayName = displayName ?? string.Empty,
            Tokens = tokens ?? string.Empty,
            Symbols = symbols ?? string.Empty,
            ConceptLabels = conceptLabels ?? string.Empty,
            BrowseSummary = browseSummary ?? string.Empty,
            TriangleCount = triangleCount,
            HasAnimations = hasAnimations,
            BoneCount = boneCount,
            ShapeClass = shapeClass,
            Tileability = tileability,
            DurationClass = durationClass,
            Engine = engine,
            GridSize = gridSize,
            QualityFlags = (qualityFlags ?? Enumerable.Empty<string>()).ToList(),
            VertexCount = vertexCount,
            MaterialCount = materialCount,
            HasUvs = hasUvs,
            PartCount = partCount,
            AnimationCount = animationCount,
            MaxDimension = maxDimension,
            CategoryId = categoryId,
            CategoryName = string.IsNullOrWhiteSpace(categoryName) ? null : categoryName.Trim(),
            UpdatedAt = updatedAt
        };
    }

    /// <summary>Flips the current-version marker (used when a newer version becomes active).</summary>
    public void SetCurrentVersion(bool isCurrent) => IsCurrentVersion = isCurrent;

    /// <summary>Hides (or unhides) the document when the asset is recycled or restored.</summary>
    public void SetActive(bool isActive) => IsActive = isActive;

    /// <summary>
    /// Re-points the denormalised category fields after a category-only mutation, so an
    /// agent that calls <c>set_category</c> can immediately confirm the write with a
    /// category-filtered search instead of waiting for the next re-derive.
    /// </summary>
    public void SetCategory(int? categoryId, string? categoryName)
    {
        CategoryId = categoryId;
        CategoryName = string.IsNullOrWhiteSpace(categoryName) ? null : categoryName.Trim();
    }
}
