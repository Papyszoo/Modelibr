using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISceneRepository
{
    Task<Scene?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IEnumerable<Scene>> GetAllAsync(CancellationToken cancellationToken = default);
    Task AddAsync(Scene scene, CancellationToken cancellationToken = default);
    Task UpdateAsync(Scene scene, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
