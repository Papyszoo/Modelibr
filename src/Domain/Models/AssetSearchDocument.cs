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

    /// <summary>full / secondary / hidden (see the derived prominence layer).</summary>
    public string Prominence { get; private set; } = "full";

    public string DisplayName { get; private set; } = string.Empty;

    /// <summary>Space-joined authored tokens (top search weight), trigram-indexed.</summary>
    public string Tokens { get; private set; } = string.Empty;

    /// <summary>Space-joined declared script symbols (mesh-name weight), trigram-indexed.</summary>
    public string Symbols { get; private set; } = string.Empty;

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
        string? categoryName = null)
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
            Prominence = string.IsNullOrWhiteSpace(prominence) ? "full" : prominence.Trim(),
            DisplayName = displayName ?? string.Empty,
            Tokens = tokens ?? string.Empty,
            Symbols = symbols ?? string.Empty,
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
}
