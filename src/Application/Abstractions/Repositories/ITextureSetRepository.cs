using Domain.Models;
using Domain.ValueObjects;

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
    Task<(IEnumerable<TextureSet> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        int? packId = null, int? projectId = null,
        TextureSetKind? kind = null,
        CancellationToken cancellationToken = default);
    Task<TextureSet> UpdateAsync(TextureSet textureSet, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
    /// <summary>
    /// Hard deletes a texture set and its texture records, but keeps the underlying files.
    /// Used for merge operations where files are kept in another texture set.
    /// </summary>
    Task HardDeleteAsync(int id, CancellationToken cancellationToken = default);
}