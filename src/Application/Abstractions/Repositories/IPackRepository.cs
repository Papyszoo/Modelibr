using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IPackRepository
{
    Task<Pack> AddAsync(Pack pack, CancellationToken cancellationToken = default);
    Task<IEnumerable<Pack>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Pack?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Pack?> GetByNameAsync(string name, CancellationToken cancellationToken = default);

    /// <summary>
    /// Names of every pack a model currently belongs to, as persisted. Used to recompute
    /// the denormalised pack names on the search projection; callers apply the pending
    /// add/remove to this list themselves rather than relying on EF fix-up ordering.
    /// </summary>
    Task<IReadOnlyList<string>> GetNamesByModelIdAsync(int modelId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Bulk form of <see cref="GetNamesByModelIdAsync"/>, keyed by model id. Models with
    /// no pack membership are absent from the result rather than present-and-empty.
    /// Used by the pack-wide mutations (rename, delete) so they stay a fixed number of
    /// queries regardless of how many models the pack holds.
    /// </summary>
    Task<IReadOnlyDictionary<int, IReadOnlyList<string>>> GetNamesByModelIdsAsync(
        IEnumerable<int> modelIds,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Finds the pack previously imported from a given store asset (the store-import
    /// idempotency key). Used to make a re-import a no-op/gap-fill instead of a second pack.
    /// </summary>
    Task<Pack?> GetByStoreImportAsync(string storeUrl, string storeAssetId, CancellationToken cancellationToken = default);
    Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default);
    Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default);
}
