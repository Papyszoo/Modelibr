using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Write side of the search projection. Documents are replaced wholesale per
/// (AssetType, AssetId, VersionId) on re-derive; the current-version marker is
/// maintained here in one place so search never returns stale versions.
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

    /// <summary>
    /// Clears the current-version flag on every document of an asset EXCEPT the
    /// given version — so exactly one version is searchable by default.
    /// </summary>
    Task<IReadOnlyList<AssetSearchDocument>> GetForOtherVersionsAsync(
        string assetType,
        int assetId,
        int? currentVersionId,
        CancellationToken cancellationToken = default);

    Task UpdateAsync(AssetSearchDocument document, CancellationToken cancellationToken = default);
}
