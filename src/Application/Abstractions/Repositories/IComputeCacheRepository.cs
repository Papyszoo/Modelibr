using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Persistence for the hash-keyed expensive-compute cache. Upserted by
/// (GeometryHash, GeometryHashVersion, Metric) so a result is shared across every
/// asset with the same geometry.
/// </summary>
public interface IComputeCacheRepository
{
    Task<ComputeCacheEntry?> GetAsync(
        string geometryHash,
        int geometryHashVersion,
        string metric,
        CancellationToken cancellationToken = default);

    Task AddAsync(ComputeCacheEntry entry, CancellationToken cancellationToken = default);

    Task UpdateAsync(ComputeCacheEntry entry, CancellationToken cancellationToken = default);
}
