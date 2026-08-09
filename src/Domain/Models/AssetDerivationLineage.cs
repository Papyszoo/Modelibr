namespace Domain.Models;

/// <summary>
/// Schema hook (not yet written to): when an agent later extracts a sub-part of a
/// composite asset into a standalone asset, that new asset records a pointer back
/// to its source asset, version and part path here. Retrofitting this after assets
/// exist is painful, so the shape is reserved now even though no code populates it.
/// One row per derived asset.
/// </summary>
public class AssetDerivationLineage
{
    public int Id { get; private set; }

    /// <summary>The derived asset's family and id.</summary>
    public string AssetType { get; private set; } = string.Empty;
    public int AssetId { get; private set; }

    /// <summary>The source this asset was derived from.</summary>
    public string SourceAssetType { get; private set; } = string.Empty;
    public int SourceAssetId { get; private set; }
    public int? SourceVersionId { get; private set; }

    /// <summary>
    /// Path to the source part (from prompt 21's part-path identifier scheme).
    /// Null when the whole asset was the source rather than a specific part.
    /// </summary>
    public string? SourcePartPath { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public static AssetDerivationLineage Create(
        string assetType,
        int assetId,
        string sourceAssetType,
        int sourceAssetId,
        DateTime createdAt,
        int? sourceVersionId = null,
        string? sourcePartPath = null)
    {
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or whitespace.", nameof(assetType));
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));
        if (string.IsNullOrWhiteSpace(sourceAssetType))
            throw new ArgumentException("Source asset type cannot be null or whitespace.", nameof(sourceAssetType));
        if (sourceAssetId <= 0)
            throw new ArgumentException("Source asset id must be greater than 0.", nameof(sourceAssetId));
        if (sourceVersionId.HasValue && sourceVersionId.Value <= 0)
            throw new ArgumentException("Source version id must be greater than 0 when provided.", nameof(sourceVersionId));

        return new AssetDerivationLineage
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            SourceAssetType = sourceAssetType.Trim(),
            SourceAssetId = sourceAssetId,
            SourceVersionId = sourceVersionId,
            SourcePartPath = string.IsNullOrWhiteSpace(sourcePartPath) ? null : sourcePartPath.Trim(),
            CreatedAt = createdAt
        };
    }
}
