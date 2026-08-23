using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Search;

/// <summary>
/// What the filters mean <b>in this library</b>.
///
/// <c>list_facets</c> describes the filter vocabulary, which is a static fact about the
/// server. It does not answer the question an agent actually has: "low poly" is a phrase in
/// a brief, and turning it into <c>maxTriangles</c> means knowing whether this corpus's
/// low-poly assets sit under 2,000 or under 200. Guessing produces a filter that returns
/// nothing and no signal about why.
/// </summary>
/// <param name="AssetType">Optional family to describe. Omitted means the whole library.</param>
public sealed record GetSearchFacetRangesQuery(string? AssetType = null)
    : IQuery<SearchFacetRangesResponse>;

/// <summary>
/// A numeric filter's real distribution.
///
/// Quartiles rather than a mean: an asset library is not normally distributed - a handful of
/// sample scenes with a hundred thousand triangles each drags a mean somewhere no asset
/// actually is, and a threshold set from it filters out most of the library.
/// </summary>
public sealed record SearchFacetRange(
    string Field,
    int Count,
    double Min,
    double P25,
    double Median,
    double P75,
    double Max);

/// <summary>One value of a categorical filter, and how many assets carry it.</summary>
public sealed record SearchFacetValue(string Value, int Count);

/// <param name="Notes">
/// What the numbers do not say. Present because a facet with no values is ambiguous - it can
/// mean "nothing carries this" or "nobody has labelled anything yet", and only one of those
/// is a reason to stop filtering on it.
/// </param>
public sealed record SearchFacetRangesResponse(
    string? AssetType,
    int IndexedAssets,
    IReadOnlyList<SearchFacetRange> Ranges,
    IReadOnlyDictionary<string, IReadOnlyList<SearchFacetValue>> Values,
    IReadOnlyList<string> Notes);

internal sealed class GetSearchFacetRangesQueryHandler
    : IQueryHandler<GetSearchFacetRangesQuery, SearchFacetRangesResponse>
{
    private readonly ISearchRepository _search;

    public GetSearchFacetRangesQueryHandler(ISearchRepository search)
    {
        _search = search;
    }

    public async Task<Result<SearchFacetRangesResponse>> Handle(
        GetSearchFacetRangesQuery query,
        CancellationToken cancellationToken)
    {
        var response = await _search.GetFacetRangesAsync(query.AssetType, cancellationToken);

        var notes = new List<string>();

        if (response.IndexedAssets == 0)
        {
            notes.Add(
                query.AssetType is { } family
                    ? $"Nothing of type '{family}' is indexed. Every range below is empty because there is nothing to measure, not because the library has no range."
                    : "Nothing is indexed. Check get_index_status before concluding a filter is broken.");
        }

        foreach (var (facet, values) in response.Values)
        {
            if (values.Count == 0)
            {
                notes.Add(
                    $"No asset carries a '{facet}'. Filtering on it returns nothing - which is a labelling gap, not a search fault.");
            }
        }

        if (notes.Count == 0)
        {
            notes.Add(
                "Quartiles, not averages: a handful of sample scenes drags a mean somewhere no asset actually is. " +
                "Read the median before turning a phrase like 'low poly' into a maxTriangles.");
        }

        return Result.Success(response with { Notes = notes });
    }
}
