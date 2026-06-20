using Application.Search;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Read-only cross-asset search. Implementations push the filtering down to
/// the database (ILIKE on Postgres) and cap per-type results.
/// </summary>
public interface ISearchRepository
{
    Task<IReadOnlyList<SearchResultGroup>> SearchAsync(
        string term,
        int perTypeLimit,
        CancellationToken cancellationToken = default);
}
