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

    /// <summary>
    /// Which of these store assets have already been imported from a given store. One query
    /// for a whole page of store search hits: asking per hit would put a round trip behind
    /// every result, and the flag exists precisely so a page of hits can be filtered.
    /// </summary>
    Task<IReadOnlySet<string>> GetImportedStoreAssetIdsAsync(
        string storeUrl,
        IReadOnlyCollection<string> storeAssetIds,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Idempotently inserts the many-to-many link between a model and a pack with an exact
    /// PostgreSQL conflict target, so concurrent additions cannot fail with a unique violation
    /// or cause an entire multi-entity SaveChanges batch to roll back.
    /// </summary>
    Task EnsureModelInPackAsync(int packId, int modelId, DateTime updatedAt, CancellationToken cancellationToken = default);

    Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default);
    Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default);
}
