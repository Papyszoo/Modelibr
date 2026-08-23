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

    /// <summary>
    /// How many assets carry each of these words at all, ignoring every other word and every
    /// filter - and, for a word the library has never heard, the nearest names it does hold.
    ///
    /// Deliberately not part of the search itself. It answers a different question ("is this
    /// word in this library?") and costs a query per word, so it is run only when the result
    /// was thin enough that the caller is about to retry blind.
    /// </summary>
    Task<IReadOnlyList<SearchTermDiagnostic>> ExplainTermsAsync(
        IReadOnlyList<SearchQueryParser.QueryTerm> terms,
        string? assetType,
        CancellationToken cancellationToken = default);
}

/// <param name="Matches">Assets carrying the word, ignoring the rest of the query and every filter.</param>
/// <param name="NearestNames">Names close enough to be worth offering, best first. Empty when <paramref name="Matches"/> is not 0.</param>
public sealed record SearchTermDiagnostic(
    string Word,
    int Matches,
    IReadOnlyList<string> NearestNames);
