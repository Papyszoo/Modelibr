using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Persistence for the raw, versioned extraction layer. Rows are upserted by the
/// (AssetType, AssetId, VersionId, FileSha256) key so re-extraction is idempotent.
/// </summary>
public interface IAssetExtractionRepository
{
    Task AddAsync(AssetExtraction extraction, CancellationToken cancellationToken = default);

    Task UpdateAsync(AssetExtraction extraction, CancellationToken cancellationToken = default);

    /// <summary>Loads the row for an exact extraction key (tracked, for upsert), or null.</summary>
    Task<AssetExtraction?> GetByKeyAsync(
        string assetType,
        int assetId,
        int? versionId,
        string fileSha256,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The newest extraction row for an asset (and version, when the family is
    /// versioned), whatever file hash it was keyed on. The read side of the
    /// metadata surfaces uses this instead of the exact-key lookup: a caller
    /// asking what an asset knows should not have to reproduce the worker's
    /// invalidation key first. A null <paramref name="versionId"/> means any
    /// version, newest first.
    /// </summary>
    Task<AssetExtraction?> GetLatestForAssetAsync(
        string assetType,
        int assetId,
        int? versionId = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Invalidation as set difference: extraction rows for a type whose
    /// <see cref="AssetExtraction.ExtractorVersion"/> is below <paramref name="currentExtractorVersion"/>
    /// (i.e. produced by an older extractor and due for re-extraction).
    /// </summary>
    Task<IReadOnlyList<AssetExtraction>> GetStaleAsync(
        string assetType,
        int currentExtractorVersion,
        CancellationToken cancellationToken = default);
}
