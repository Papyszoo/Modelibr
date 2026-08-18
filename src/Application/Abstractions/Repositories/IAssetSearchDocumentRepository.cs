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

    /// <summary>
    /// Re-points the denormalised pack names after a membership-only mutation: add to
    /// pack, remove from pack, pack rename, pack delete. None of those re-derive the
    /// asset, so without this the projection keeps the membership it had at extraction
    /// time - which for a freshly imported-then-packed asset is none at all.
    /// </summary>
    Task SetPacksForAssetAsync(
        string assetType,
        int assetId,
        IEnumerable<string> packNames,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Bulk form of <see cref="SetPacksForAssetAsync"/>, for mutations that change every
    /// member of a pack at once: rename and delete. Those touch the whole membership, and
    /// packs are large - `The Base Mesh` has 1,360 members - so the per-asset call in a
    /// loop is thousands of round trips inside one request. One query in, one query out.
    /// </summary>
    Task SetPacksForAssetsAsync(
        string assetType,
        IReadOnlyDictionary<int, IReadOnlyList<string>> packNamesByAssetId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Re-points the denormalised tags and description after a metadata-only mutation
    /// (<c>set_tags</c>, the tag editor).
    /// </summary>
    /// <remarks>
    /// The learning loop this projection exists to serve: a user corrects what an asset is
    /// called, and search can find it by that immediately rather than at the next
    /// re-derive - which for most assets never comes.
    /// </remarks>
    Task SetMetadataForAssetAsync(
        string assetType,
        int assetId,
        IEnumerable<string> tags,
        string? description,
        CancellationToken cancellationToken = default);

    Task UpdateAsync(AssetSearchDocument document, CancellationToken cancellationToken = default);
}
