using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IProjectReferenceRepository
{
    Task<ProjectConceptImage?> GetByIdAsync(int projectId, int referenceId, CancellationToken cancellationToken = default);
    Task<IEnumerable<ProjectConceptImage>> GetForProjectAsync(
        int projectId,
        int? levelId = null,
        int? characterId = null,
        CancellationToken cancellationToken = default);
    Task UpdateAsync(ProjectConceptImage reference, CancellationToken cancellationToken = default);
}
