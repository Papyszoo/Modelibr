using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IProjectCharacterRepository
{
    Task<ProjectCharacter> AddAsync(ProjectCharacter character, CancellationToken cancellationToken = default);
    Task<ProjectCharacter?> GetByIdAsync(int projectId, int characterId, CancellationToken cancellationToken = default);
    Task<IEnumerable<ProjectCharacter>> GetForProjectAsync(int projectId, CancellationToken cancellationToken = default);
    Task UpdateAsync(ProjectCharacter character, CancellationToken cancellationToken = default);
    Task DeleteAsync(ProjectCharacter character, CancellationToken cancellationToken = default);
}
