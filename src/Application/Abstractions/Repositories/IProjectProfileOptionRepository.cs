using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// The project-profile vocabulary (prompt 13-B). One table for all five dimensions, so every
/// read here is dimension-scoped rather than table-scoped.
/// </summary>
public interface IProjectProfileOptionRepository
{
    Task<IReadOnlyList<ProjectProfileOption>> GetAllAsync(
        bool includeHidden = false, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProjectProfileOption>> GetByDimensionAsync(
        string dimension, bool includeHidden = false, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProjectProfileOption>> GetByIdsAsync(
        IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default);

    /// <summary>The option with this name in this dimension, or null. The find half of find-or-create.</summary>
    Task<ProjectProfileOption?> GetByNameAsync(
        string dimension, string normalizedName, CancellationToken cancellationToken = default);

    Task AddAsync(ProjectProfileOption option, CancellationToken cancellationToken = default);

    Task UpdateAsync(ProjectProfileOption option, CancellationToken cancellationToken = default);
}
