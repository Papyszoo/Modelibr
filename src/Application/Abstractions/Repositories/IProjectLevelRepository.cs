using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IProjectLevelRepository
{
    Task<ProjectLevel> AddAsync(ProjectLevel level, CancellationToken cancellationToken = default);
    Task<ProjectLevel?> GetByIdAsync(int projectId, int levelId, CancellationToken cancellationToken = default);
    Task<IEnumerable<ProjectLevel>> GetForProjectAsync(int projectId, CancellationToken cancellationToken = default);
    Task<int> GetNextSortOrderAsync(int projectId, CancellationToken cancellationToken = default);
    Task<bool> NameExistsAsync(int projectId, string name, int? excludingLevelId = null, CancellationToken cancellationToken = default);
    Task UpdateAsync(ProjectLevel level, CancellationToken cancellationToken = default);
    Task DeleteAsync(ProjectLevel level, CancellationToken cancellationToken = default);
}
