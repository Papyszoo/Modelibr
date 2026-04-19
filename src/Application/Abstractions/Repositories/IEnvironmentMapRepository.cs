using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IEnvironmentMapRepository
{
    Task<EnvironmentMap> AddAsync(EnvironmentMap environmentMap, CancellationToken cancellationToken = default);
    Task<IEnumerable<EnvironmentMap>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<EnvironmentMap>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<EnvironmentMap>> GetAllWithDeletedVariantsAsync(CancellationToken cancellationToken = default);
    Task<EnvironmentMap?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<EnvironmentMap?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<EnvironmentMap?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<EnvironmentMap?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default);
    Task<EnvironmentMap?> GetByFileHashesAsync(
        IEnumerable<string> sha256Hashes,
        EnvironmentMapProjectionType projectionType,
        CancellationToken cancellationToken = default);
    Task<EnvironmentMap?> GetByVariantIdIncludingDeletedAsync(int variantId, CancellationToken cancellationToken = default);
    Task<(IEnumerable<EnvironmentMap> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        int? packId = null,
        int? projectId = null,
        CancellationToken cancellationToken = default);
    Task<EnvironmentMap> UpdateAsync(EnvironmentMap environmentMap, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
