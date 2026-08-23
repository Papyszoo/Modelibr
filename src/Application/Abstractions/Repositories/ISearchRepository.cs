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

    /// <summary>
    /// The real distribution behind the numeric filters, and the values the categorical ones
    /// actually hold, over the current-version asset documents.
    ///
    /// Read from the projection rather than from the entities because that is what search
    /// filters against - a range taken from anywhere else could describe assets a filter
    /// cannot reach.
    /// </summary>
    Task<SearchFacetRangesResponse> GetFacetRangesAsync(
        string? assetType,
        CancellationToken cancellationToken = default);
}
