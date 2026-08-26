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

    /// <summary>
    /// The assets the import automation classified that nobody has looked at yet, newest
    /// first, plus how many there are in total.
    /// </summary>
    /// <remarks>
    /// The review queue's only query. Paged because a 1,700-model import puts 1,700 assets
    /// in it at once, and the screen shows a page while the count drives the banner.
    /// </remarks>
    Task<(IReadOnlyList<AssetMetadata> Items, int TotalCount)> GetPendingAutoReviewAsync(
        string assetType,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The rows for a set of assets that the automation classified and nobody has reviewed.
    /// The write side of the review action - it must not mark an asset reviewed that was
    /// never guessed at, or reviewed twice.
    /// </summary>
    Task<IReadOnlyList<AssetMetadata>> GetPendingAutoReviewByIdsAsync(
        string assetType,
        IReadOnlyCollection<int> assetIds,
        CancellationToken cancellationToken = default);

    Task AddAsync(AssetMetadata metadata, CancellationToken cancellationToken = default);

    Task UpdateAsync(AssetMetadata metadata, CancellationToken cancellationToken = default);

    Task DeleteAsync(AssetMetadata metadata, CancellationToken cancellationToken = default);
}
