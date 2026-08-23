using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Extraction;
using Application.Search;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The batched reads, and the one property that makes them worth having: a bad entry costs
/// its own answer and nothing else.
///
/// A batch that failed whole would be worse than the loop it replaces - the agent would
/// have to retry every question to recover the one that broke, which is more round trips
/// than it started with.
/// </summary>
public class AssetSearchMcpToolsTests
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static JsonElement Read(object value) =>
        JsonSerializer.SerializeToElement(value, Options);

    private static AssetSearchResponse Response(string term) => new(
        [new AssetSearchHit("Model", term.Length, 7, null, term, $"{term} summary", "primary", "name")],
        1);

    [Fact]
    public async Task SearchMany_Answers_Every_Entry_In_Request_Order_With_Its_Own_Label()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetSearchQuery q, CancellationToken _) => Result.Success(Response(q.Term)));

        var result = await AssetSearchMcpTools.SearchMany(
            handler.Object,
            [
                new AssetSearchMcpTools.SearchRequest("sofa", "seating"),
                new AssetSearchMcpTools.SearchRequest("rug"),
            ]);

        var searches = Read(result).GetProperty("searches");

        Assert.Equal(2, searches.GetArrayLength());
        Assert.Equal("seating", searches[0].GetProperty("label").GetString());
        // No label given, so the query is the label - matching answers to questions must
        // never come down to counting.
        Assert.Equal("rug", searches[1].GetProperty("label").GetString());
        Assert.Equal(0, searches[0].GetProperty("index").GetInt32());
    }

    [Fact]
    public async Task SearchMany_Lets_One_Entry_Fail_Without_Losing_The_Others()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetSearchQuery q, CancellationToken _) => q.Term == "broken"
                ? Result.Failure<AssetSearchResponse>(new Error("Search.Bad", "no"))
                : Result.Success(Response(q.Term)));

        var result = await AssetSearchMcpTools.SearchMany(
            handler.Object,
            [
                new AssetSearchMcpTools.SearchRequest("sofa"),
                new AssetSearchMcpTools.SearchRequest("broken"),
                new AssetSearchMcpTools.SearchRequest("rug"),
            ]);

        var searches = Read(result).GetProperty("searches");

        Assert.Equal("Search.Bad", searches[1].GetProperty("error").GetString());
        Assert.Equal(1, searches[0].GetProperty("totalCount").GetInt32());
        Assert.Equal(1, searches[2].GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task SearchMany_Applies_The_Calls_Project_To_Every_Entry()
    {
        // A brief is searched on behalf of one project. Per-entry profiles would be a second
        // way to say the same thing, and two ways to get it wrong.
        var seen = new List<int?>();
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()))
            .Callback<AssetSearchQuery, CancellationToken>((q, _) => seen.Add(q.ProjectId))
            .ReturnsAsync((AssetSearchQuery q, CancellationToken _) => Result.Success(Response(q.Term)));

        await AssetSearchMcpTools.SearchMany(
            handler.Object,
            [
                new AssetSearchMcpTools.SearchRequest("sofa"),
                new AssetSearchMcpTools.SearchRequest("rug"),
            ],
            projectId: 4);

        Assert.Equal([4, 4], seen);
    }

    [Fact]
    public async Task SearchMany_Rejects_An_Empty_Batch_Rather_Than_Answering_Nothing()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();

        var result = await AssetSearchMcpTools.SearchMany(handler.Object, []);

        Assert.Equal("EmptyBatch", Read(result).GetProperty("error").GetString());
        handler.Verify(
            h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetAssets_Reads_Each_Entry_At_The_Version_It_Named()
    {
        // The trap this exists to close: a hit names a version, and answering about the
        // active one instead describes an asset the caller never saw.
        var seen = new List<int?>();
        var handler = new Mock<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .Callback<GetAssetMetadataQuery, CancellationToken>((q, _) => seen.Add(q.VersionId))
            .ReturnsAsync(Result.Failure<AssetMetadataResponse>(new Error("Asset.NotFound", "gone")));

        await AssetSearchMcpTools.GetAssets(
            handler.Object,
            [
                new AssetSearchMcpTools.AssetRequest("Model", 1, 7),
                new AssetSearchMcpTools.AssetRequest("Model", 2, 9),
            ]);

        Assert.Equal([7, 9], seen);
    }

    [Fact]
    public async Task GetAssets_Reports_A_Missing_Asset_Against_Its_Own_Entry()
    {
        var handler = new Mock<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<AssetMetadataResponse>(new Error("Asset.NotFound", "gone")));

        var result = await AssetSearchMcpTools.GetAssets(
            handler.Object, [new AssetSearchMcpTools.AssetRequest("Model", 42)]);

        var assets = Read(result).GetProperty("assets");

        Assert.Equal("Asset.NotFound", assets[0].GetProperty("error").GetString());
        Assert.Equal(42, assets[0].GetProperty("assetId").GetInt32());
    }
}
