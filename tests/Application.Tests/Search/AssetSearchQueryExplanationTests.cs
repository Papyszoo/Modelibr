using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Media;
using Application.Search;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// What a search says about itself when it comes back thin (06-B).
///
/// The gap this closes is a round-trip one. A query that returned junk gave no signal about
/// <b>why</b>: an agent could not tell "that word is not in this library" from "those words
/// do not occur together" from "your seventh word was never scored", so the next call was a
/// guess and the one after that was another.
/// </summary>
public class AssetSearchQueryExplanationTests
{
    private static readonly DateTime Now = new(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<ISearchRepository> _search = new();
    private readonly AssetSearchQueryHandler _handler;

    private int _totalCount;
    private readonly List<SearchTermDiagnostic> _diagnostics = new();

    public AssetSearchQueryExplanationTests()
    {
        var thumbnails = new Mock<IAssetThumbnails>();
        thumbnails
            .Setup(t => t.ResolveAsync(It.IsAny<IEnumerable<AssetThumbnailRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, AssetThumbnail>(StringComparer.Ordinal));

        _search
            .Setup(r => r.SearchAssetsAsync(It.IsAny<AssetSearchRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => new AssetSearchResponse(Array.Empty<AssetSearchHit>(), _totalCount));

        _search
            .Setup(r => r.ExplainTermsAsync(
                It.IsAny<IReadOnlyList<SearchQueryParser.QueryTerm>>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<SearchQueryParser.QueryTerm> terms, string? _, CancellationToken _) =>
                terms
                    .Select(t => _diagnostics.FirstOrDefault(d => d.Word == t.Word)
                                 ?? new SearchTermDiagnostic(t.Word, 12, Array.Empty<string>()))
                    .ToList());

        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        _handler = new AssetSearchQueryHandler(
            _search.Object,
            new Mock<ISearchLogRepository>().Object,
            clock.Object,
            new Mock<IUnitOfWork>().Object,
            new Mock<IProjectRepository>().Object,
            new Mock<ISceneRepository>().Object,
            thumbnails.Object);
    }

    private async Task<AssetSearchQueryView?> Explain(string term)
    {
        var result = await _handler.Handle(new AssetSearchQuery(term), CancellationToken.None);
        Assert.True(result.IsSuccess);
        return result.Value.Query;
    }

    [Fact]
    public async Task The_Response_Says_Which_Words_It_Scored_And_Which_It_Dropped()
    {
        _totalCount = 40;

        var query = await Explain("a sofa for the living room");

        Assert.NotNull(query);
        Assert.Equal(["sofa", "living", "room"], query!.Terms.Select(t => t.Word));
        Assert.Contains(query.Ignored, w => w.Word == "the" && w.Reason == SearchQueryParser.IgnoredReasons.StopWord);
    }

    [Fact]
    public async Task A_Search_That_Answered_Is_Not_Charged_For_Per_Word_Counts()
    {
        // The counts are a query per word. A search returning forty candidates has already
        // told the caller what it needed; measuring is for the case where it has not.
        _totalCount = 40;

        var query = await Explain("sofa");

        Assert.All(query!.Terms, t => Assert.Null(t.Matches));
        _search.Verify(
            r => r.ExplainTermsAsync(
                It.IsAny<IReadOnlyList<SearchQueryParser.QueryTerm>>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task A_Thin_Result_Names_The_Word_This_Library_Has_Never_Heard()
    {
        _totalCount = 1;
        _diagnostics.Add(new SearchTermDiagnostic("settee", 0, ["Sofa 01", "Loveseat"]));

        var query = await Explain("brown settee");

        var settee = query!.Terms.Single(t => t.Word == "settee");
        Assert.Equal(0, settee.Matches);
        Assert.Equal(["Sofa 01", "Loveseat"], settee.DidYouMean);
        Assert.Contains("'settee'", query.Note);
        Assert.Contains("Sofa 01", query.Note);
        // The other word did match, so the search still ran on something.
        Assert.Contains("the search ran on the rest", query.Note);
    }

    [Fact]
    public async Task Every_Word_Known_But_Nothing_Carrying_Them_Together_Says_So()
    {
        // The other half of "why is this empty". Telling the caller to drop a word is the
        // fix; "no results" on its own invites another invented synonym.
        _totalCount = 0;

        var query = await Explain("brass victorian streetlight");

        Assert.All(query!.Terms, t => Assert.Equal(12, t.Matches));
        Assert.Contains("Drop the least important word", query.Note);
    }

    [Fact]
    public async Task Words_Past_The_Scored_Limit_Are_Reported_Rather_Than_Silently_Dropped()
    {
        // A brief whose meaning was in its eighth word gets a plausible, wrong answer, and
        // nothing anywhere used to suggest why.
        _totalCount = 40;

        var query = await Explain("wooden rustic round dining kitchen table lamp");

        Assert.Contains(
            query!.Ignored,
            w => w.Word == "lamp" && w.Reason == SearchQueryParser.IgnoredReasons.BeyondWordLimit);
        Assert.Contains("'lamp'", query.Note);
    }

    [Fact]
    public async Task A_Blank_Query_Has_Nothing_To_Explain()
    {
        // Blank means "everything matching the filters". An empty explanation on every
        // browse call is noise.
        _totalCount = 0;

        Assert.Null(await Explain("   "));
    }
}
