using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IStoreImportedItemRepository
{
    Task<StoreImportedItem?> GetByProvenanceAsync(
        string storeUrl,
        string storeAssetId,
        string storeItemId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StoreImportedItem>> GetByAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default);

    Task AddAsync(StoreImportedItem item, CancellationToken cancellationToken = default);

    Task DeleteByAssetAsync(string assetType, int assetId, CancellationToken cancellationToken = default);

    Task DeleteAsync(StoreImportedItem item, CancellationToken cancellationToken = default);
}
