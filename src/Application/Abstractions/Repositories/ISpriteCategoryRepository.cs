using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISpriteCategoryRepository
{
    Task<SpriteCategory> AddAsync(SpriteCategory category, CancellationToken cancellationToken = default);
    Task<IEnumerable<SpriteCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<SpriteCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<SpriteCategory?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<SpriteCategory> UpdateAsync(SpriteCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
