using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISpriteRepository
{
    Task<Sprite> AddAsync(Sprite sprite, CancellationToken cancellationToken = default);
    Task<IEnumerable<Sprite>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Sprite>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<Sprite?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Sprite?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Sprite?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<Sprite?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<(IEnumerable<Sprite> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        int? packId = null, int? projectId = null, int? categoryId = null,
        CancellationToken cancellationToken = default);
    Task<Sprite> UpdateAsync(Sprite sprite, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
