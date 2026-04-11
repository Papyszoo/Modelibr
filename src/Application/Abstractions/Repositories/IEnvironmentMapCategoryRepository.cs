using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IEnvironmentMapCategoryRepository
{
    Task<EnvironmentMapCategory> AddAsync(EnvironmentMapCategory category, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<EnvironmentMapCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<EnvironmentMapCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<EnvironmentMapCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default);
    Task UpdateAsync(EnvironmentMapCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(EnvironmentMapCategory category, CancellationToken cancellationToken = default);
}
