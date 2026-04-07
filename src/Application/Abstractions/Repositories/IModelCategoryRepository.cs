using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelCategoryRepository
{
    Task<ModelCategory> AddAsync(ModelCategory category, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ModelCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ModelCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default);
    Task UpdateAsync(ModelCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(ModelCategory category, CancellationToken cancellationToken = default);
}