using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISoundCategoryRepository
{
    Task<SoundCategory> AddAsync(SoundCategory category, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SoundCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<SoundCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<SoundCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default);
    Task UpdateAsync(SoundCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(SoundCategory category, CancellationToken cancellationToken = default);
}
