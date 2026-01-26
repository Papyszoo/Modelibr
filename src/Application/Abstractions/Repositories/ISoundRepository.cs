using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISoundRepository
{
    Task<Sound> AddAsync(Sound sound, CancellationToken cancellationToken = default);
    Task<IEnumerable<Sound>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Sound>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<Sound?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Sound?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Sound?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<Sound?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<Sound> UpdateAsync(Sound sound, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
