using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISceneRepository
{
    Task<Scene?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Scene?> GetPrimaryByLevelAsync(int levelId, CancellationToken cancellationToken = default);
    /// <summary>
    /// Scenes filed under any of the given levels, tracked for mutation. Used when a
    /// level (or a project's levels) is deleted: the FK is SET NULL, and a scene left
    /// primary with no level violates CK_Scenes_PrimaryLevelRequiresLevel.
    /// </summary>
    Task<IReadOnlyList<Scene>> GetByLevelsAsync(
        IReadOnlyCollection<int> levelIds,
        CancellationToken cancellationToken = default);
    Task<IEnumerable<Scene>> GetAllAsync(CancellationToken cancellationToken = default);
    Task AddAsync(Scene scene, CancellationToken cancellationToken = default);
    Task UpdateAsync(Scene scene, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
