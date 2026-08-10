using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>Append-only search log (one row per deliberate search); opened-result recorded after the fact.</summary>
public interface ISearchLogRepository
{
    Task AddAsync(SearchLog log, CancellationToken cancellationToken = default);

    Task<SearchLog?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    Task UpdateAsync(SearchLog log, CancellationToken cancellationToken = default);
}
