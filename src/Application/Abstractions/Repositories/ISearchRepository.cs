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

    /// <summary>
    /// Structured search over the derived-layer projection: trigram + full-text
    /// ranking (tokenised names outrank substring hits), composable structural
    /// filters, current-version-only, prominence-gated.
    /// </summary>
    Task<AssetSearchResponse> SearchAssetsAsync(
        AssetSearchRequest request,
        CancellationToken cancellationToken = default);
}
