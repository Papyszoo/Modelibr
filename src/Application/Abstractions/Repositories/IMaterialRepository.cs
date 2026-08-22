using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IMaterialRepository
{
    Task<Material> AddAsync(Material material, CancellationToken cancellationToken = default);
    Task<IEnumerable<Material>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Material>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<Material?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Batch read for choice-card media: one query for every material a scene's
    /// candidates name, rather than one per card.
    /// </summary>
    Task<IReadOnlyList<Material>> GetByIdsAsync(
        IReadOnlyCollection<int> ids,
        CancellationToken cancellationToken = default);
    Task<Material?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Material?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default);
    Task<Material> UpdateAsync(Material material, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
