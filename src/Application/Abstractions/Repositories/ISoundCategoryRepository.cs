using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISoundCategoryRepository
{
    Task<SoundCategory> AddAsync(SoundCategory category, CancellationToken cancellationToken = default);
    Task<IEnumerable<SoundCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<SoundCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<SoundCategory?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<SoundCategory> UpdateAsync(SoundCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
