using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Generic repository interface for hierarchical category entities.
/// Concrete category repositories extend this with their specific type.
/// </summary>
public interface IHierarchicalCategoryRepository<TCategory>
    where TCategory : class, IHierarchicalCategory<TCategory>
{
    Task<TCategory> AddAsync(TCategory category, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<TCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<TCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default);
    Task UpdateAsync(TCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(TCategory category, CancellationToken cancellationToken = default);
}
