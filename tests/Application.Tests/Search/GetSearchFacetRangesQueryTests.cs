using Application.Abstractions.Repositories;
using Application.Search;
using Moq;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// What the filters mean in this library, and the two ways reporting that can mislead.
///
/// "Low poly" is a phrase in a brief. Turning it into a `maxTriangles` needs the corpus's
/// own numbers, and a filter guessed from experience returns nothing while giving the caller
/// no signal about why.
/// </summary>
public class GetSearchFacetRangesQueryTests
{
    private readonly Mock<ISearchRepository> _search = new();

    private GetSearchFacetRangesQueryHandler Handler => new(_search.Object);

    private void Given(SearchFacetRangesResponse response) =>
        _search
            .Setup(r => r.GetFacetRangesAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(response);

    private static SearchFacetRangesResponse Response(
        int indexed = 100,
        IReadOnlyList<SearchFacetRange>? ranges = null,
        IReadOnlyDictionary<string, IReadOnlyList<SearchFacetValue>>? values = null) =>
        new(
            "Model",
            indexed,
            ranges ?? [new SearchFacetRange("triangles", 100, 8, 420, 1_200, 5_600, 180_000)],
            values ?? new Dictionary<string, IReadOnlyList<SearchFacetValue>>(StringComparer.Ordinal)
            {
                ["category"] = [new SearchFacetValue("Furniture", 40)],
            },
            []);

    [Fact]
    public async Task An_Empty_Facet_Is_Reported_As_A_Labelling_Gap_Not_A_Broken_Filter()
    {
        // The trap this exists for: a library with zero authored styles answers every style
        // filter with nothing, and the honest reading of that is "nobody has labelled
        // anything", not "search is not working".
        Given(Response(values: new Dictionary<string, IReadOnlyList<SearchFacetValue>>(StringComparer.Ordinal)
        {
            ["styles"] = [],
        }));

        var result = await Handler.Handle(new GetSearchFacetRangesQuery("Model"), CancellationToken.None);

        Assert.Contains(result.Value.Notes, n => n.Contains("styles") && n.Contains("labelling gap"));
    }

    [Fact]
    public async Task Nothing_Indexed_Is_Said_Out_Loud_Rather_Than_Reported_As_A_Zero_Range()
    {
        // Otherwise every range reads as "this library's assets have 0 triangles", which is
        // a measurement rather than an absence.
        Given(Response(indexed: 0, ranges: []));

        var result = await Handler.Handle(new GetSearchFacetRangesQuery("Model"), CancellationToken.None);

        Assert.Contains(result.Value.Notes, n => n.Contains("Nothing of type 'Model' is indexed"));
    }

    [Fact]
    public async Task A_Healthy_Library_Still_Gets_The_Warning_About_Reading_A_Mean()
    {
        Given(Response());

        var result = await Handler.Handle(new GetSearchFacetRangesQuery("Model"), CancellationToken.None);

        Assert.Contains(result.Value.Notes, n => n.Contains("Quartiles, not averages"));
        Assert.Equal(1_200, result.Value.Ranges.Single().Median);
    }
}
