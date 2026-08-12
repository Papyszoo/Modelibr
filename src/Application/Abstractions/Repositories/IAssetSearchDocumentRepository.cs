using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Write side of the search projection. Documents are replaced wholesale per
/// (AssetType, AssetId, VersionId) on re-derive; the current-version marker is
/// maintained here in one place so search never returns stale versions.
///
/// The projection is denormalised, so every state transition that search reads -
/// active version, category, soft delete, restore, permanent delete - has to be
/// mirrored here. Search reads projection state only, so anything not mirrored is
/// simply wrong until the next extraction happens to run.
/// </summary>
public interface IAssetSearchDocumentRepository
{
    Task AddAsync(AssetSearchDocument document, CancellationToken cancellationToken = default);

    /// <summary>Stages removal of all documents for an asset+version (replace semantics). No commit.</summary>
    Task RemoveForAssetAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default);

    /// <summary>Stages removal of every document for an asset, across all versions (permanent delete).</summary>
    Task RemoveAllForAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Clears the current-version flag on every document of an asset EXCEPT the
    /// given version - so exactly one version is searchable by default.
    /// </summary>
    Task<IReadOnlyList<AssetSearchDocument>> GetForOtherVersionsAsync(
        string assetType,
        int assetId,
        int? currentVersionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Points the current-version marker at <paramref name="currentVersionId"/> and clears it
    /// everywhere else for the asset. Used when the active version changes without a
    /// re-extraction, which search would otherwise never learn about.
    /// </summary>
    Task SetCurrentVersionAsync(
        string assetType,
        int assetId,
        int? currentVersionId,
        CancellationToken cancellationToken = default);

    /// <summary>Hides (soft delete) or unhides (restore) every document for an asset.</summary>
    Task SetActiveForAssetAsync(
        string assetType,
        int assetId,
        bool isActive,
        CancellationToken cancellationToken = default);

    /// <summary>Hides or unhides every document for a single version of an asset.</summary>
    Task SetActiveForVersionAsync(
        string assetType,
        int assetId,
        int versionId,
        bool isActive,
        CancellationToken cancellationToken = default);

    /// <summary>Re-points the denormalised category fields after a category-only mutation.</summary>
    Task SetCategoryForAssetAsync(
        string assetType,
        int assetId,
        int? categoryId,
        string? categoryName,
        CancellationToken cancellationToken = default);

    Task UpdateAsync(AssetSearchDocument document, CancellationToken cancellationToken = default);
}
