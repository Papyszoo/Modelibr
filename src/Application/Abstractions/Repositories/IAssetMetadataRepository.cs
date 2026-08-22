using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// The asset metadata side table (prompt 16-B). Reads are keyed by the (asset type, asset
/// id) pair rather than by row id, because that pair is the asset's identity everywhere
/// else in the derived layer.
/// </summary>
public interface IAssetMetadataRepository
{
    Task<AssetMetadata?> GetAsync(string assetType, int assetId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The rows for a whole page of assets in one query. A list view that shows a licence
    /// badge must not put a round trip behind every card.
    /// </summary>
    Task<IReadOnlyList<AssetMetadata>> GetManyAsync(
        string assetType,
        IReadOnlyCollection<int> assetIds,
        CancellationToken cancellationToken = default);

    Task AddAsync(AssetMetadata metadata, CancellationToken cancellationToken = default);

    Task UpdateAsync(AssetMetadata metadata, CancellationToken cancellationToken = default);

    Task DeleteAsync(AssetMetadata metadata, CancellationToken cancellationToken = default);
}
