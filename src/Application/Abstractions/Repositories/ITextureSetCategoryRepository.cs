using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ITextureSetCategoryRepository
{
    Task<TextureSetCategory> AddAsync(TextureSetCategory category, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TextureSetCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<TextureSetCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<TextureSetCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default);
    Task UpdateAsync(TextureSetCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(TextureSetCategory category, CancellationToken cancellationToken = default);
}
