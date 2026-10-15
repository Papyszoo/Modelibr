using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IProjectCharacterTagRepository
{
    Task<IReadOnlyList<ProjectCharacterTag>> GetOrCreateAsync(
        int projectId,
        IEnumerable<string>? names,
        DateTime now,
        CancellationToken cancellationToken = default);
}
