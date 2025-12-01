using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ITextureSetRepository
{
    Task<TextureSet> AddAsync(TextureSet textureSet, CancellationToken cancellationToken = default);
    Task<IEnumerable<TextureSet>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<TextureSet>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<TextureSet?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<TextureSet?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<TextureSet?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<TextureSet?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<TextureSet> UpdateAsync(TextureSet textureSet, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}