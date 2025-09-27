using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ITexturePackRepository
{
    Task<TexturePack> AddAsync(TexturePack texturePack, CancellationToken cancellationToken = default);
    Task<IEnumerable<TexturePack>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<TexturePack?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<TexturePack?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<TexturePack> UpdateAsync(TexturePack texturePack, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}