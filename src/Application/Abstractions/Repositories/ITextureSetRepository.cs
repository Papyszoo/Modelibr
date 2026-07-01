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
    Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default);
    /// <summary>
    /// Distinct tag names currently assigned to (non-deleted) texture sets.
    /// This is the texture-set tag vocabulary — kept separate from the model tag
    /// pool so tag suggestions stay strictly per-asset-type.
    /// </summary>
    Task<IReadOnlyList<string>> GetAssignedTagNamesAsync(CancellationToken cancellationToken = default);
    Task<(IEnumerable<TextureSet> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        IReadOnlyCollection<int>? packIds = null,
        IReadOnlyCollection<int>? projectIds = null,
        IReadOnlyCollection<int>? categoryIds = null,
        IReadOnlyCollection<TextureType>? textureTypes = null,
        TextureSetKind? kind = null,
        string? searchName = null,
        int? minResolution = null,
        IReadOnlyCollection<string>? normalizedTagNames = null,
        CancellationToken cancellationToken = default);
    Task<TextureSet> UpdateAsync(TextureSet textureSet, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
    /// <summary>
    /// Hard deletes a texture set and its texture records, but keeps the underlying files.
    /// Used for merge operations where files are kept in another texture set.
    /// </summary>
    Task HardDeleteAsync(int id, CancellationToken cancellationToken = default);
}
