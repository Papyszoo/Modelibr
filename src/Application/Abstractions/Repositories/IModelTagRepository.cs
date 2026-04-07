using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelTagRepository
{
    Task<IReadOnlyList<ModelTag>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelTag>> GetByNormalizedNamesAsync(IReadOnlyCollection<string> normalizedNames, CancellationToken cancellationToken = default);
    Task AddRangeAsync(IEnumerable<ModelTag> tags, CancellationToken cancellationToken = default);
}