using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IPackRepository
{
    Task<Pack> AddAsync(Pack pack, CancellationToken cancellationToken = default);
    Task<IEnumerable<Pack>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Pack?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Pack?> GetByNameAsync(string name, CancellationToken cancellationToken = default);

    /// <summary>
    /// Finds the pack previously imported from a given store asset (the store-import
    /// idempotency key). Used to make a re-import a no-op/gap-fill instead of a second pack.
    /// </summary>
    Task<Pack?> GetByStoreImportAsync(string storeUrl, string storeAssetId, CancellationToken cancellationToken = default);
    Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default);
    Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default);
}
