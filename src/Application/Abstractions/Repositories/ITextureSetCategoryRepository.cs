using Domain.Models;
using Domain.ValueObjects;

namespace Application.Abstractions.Repositories;

public interface ITextureSetCategoryRepository : IHierarchicalCategoryRepository<TextureSetCategory>
{
    Task<IReadOnlyList<TextureSetCategory>> GetAllByKindAsync(TextureSetKind kind, CancellationToken cancellationToken = default);
    Task<TextureSetCategory?> GetByNameAsync(string name, int? parentId, TextureSetKind kind, CancellationToken cancellationToken = default);
}
