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

    /// <summary>
    /// Removes every reference link that targets a level. Called before the level row is
    /// deleted: the FK is SET NULL, which would otherwise leave a link with no target and
    /// trip CK_ProjectReferenceLinks_OneTarget. The reference images themselves are kept.
    /// </summary>
    Task DeleteLinksForLevelAsync(int projectId, int levelId, CancellationToken cancellationToken = default);

    /// <summary>The character twin of <see cref="DeleteLinksForLevelAsync"/>.</summary>
    Task DeleteLinksForCharacterAsync(int projectId, int characterId, CancellationToken cancellationToken = default);
}
