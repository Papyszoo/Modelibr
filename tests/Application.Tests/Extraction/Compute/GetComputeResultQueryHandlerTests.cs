using Application.Abstractions.Repositories;
using Application.Extraction.Compute;
using Domain.Models;
using Moq;
using Xunit;

namespace Application.Tests.Extraction.Compute;

/// <summary>
/// The cache contract for <c>surface-area</c>, which is narrower than it looks.
///
/// <para>
/// The cache is keyed by a geometry hash computed from LOCAL vertex coordinates, so two
/// instances of one mesh at different scales hash identically. Until 2026-08-24 the worker
/// wrote the WORLD-space area under that key - a number that depends on the transform - so
/// whichever instance was measured first had its surface served to the other as fact. A
/// mesh scaled 100x has 10,000x the area and nothing about the answer looked wrong.
/// </para>
///
/// <para>
/// Those rows are deleted on migration, but the reader has to refuse them too: an older
/// worker still running still writes them, and the row itself is the only place the
/// distinction can be made.
/// </para>
/// </summary>
public class GetComputeResultQueryHandlerTests
{
    private const string Hash = "dff7e3502d16ec4b";

    private readonly Mock<IComputeCacheRepository> _repo = new();
    private readonly GetComputeResultQueryHandler _handler;

    public GetComputeResultQueryHandlerTests()
    {
        _handler = new GetComputeResultQueryHandler(_repo.Object);
    }

    [Fact]
    public async Task A_Local_Space_Surface_Area_Row_Is_Served()
    {
        Cached("surface-area", """{"surfaceArea":3.041672,"triangleCount":224,"space":"local"}""");

        var result = await Handle("surface-area");

        Assert.Equal("cached", result.Status);
        Assert.Contains("3.041672", result.Result);
    }

    [Fact]
    public async Task A_Legacy_Unmarked_Surface_Area_Row_Is_Reported_Pending_Not_Served()
    {
        // The exact payload the old worker wrote: a world-space number with nothing saying
        // which instance produced it. There is no conversion back, only a recompute.
        Cached("surface-area", """{"surfaceArea":12.166688,"triangleCount":224}""");

        var result = await Handle("surface-area");

        Assert.Equal("pending", result.Status);
        Assert.Null(result.Result);
    }

    [Fact]
    public async Task A_Surface_Area_Row_Marked_With_Any_Other_Space_Is_Also_Refused()
    {
        // Defensive rather than expected: the marker is checked for what it must BE, not
        // for the absence of something bad.
        Cached("surface-area", """{"surfaceArea":12.166688,"space":"world"}""");

        Assert.Equal("pending", (await Handle("surface-area")).Status);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not json at all")]
    [InlineData("[]")]
    public async Task An_Unreadable_Surface_Area_Row_Is_Refused(string payload)
    {
        Cached("surface-area", payload);

        Assert.Equal("pending", (await Handle("surface-area")).Status);
    }

    [Fact]
    public async Task Two_Scaled_Instances_Of_One_Mesh_Share_A_Row_That_Is_Scale_Free()
    {
        // Why the marker exists at all. Both instances ask with the same hash - that is the
        // point of the hash - so whatever the row holds is served to both. It may therefore
        // only hold something true of both, which the world-space area never is.
        Cached("surface-area", """{"surfaceArea":3.041672,"triangleCount":224,"space":"local"}""");

        var atOneX = await Handle("surface-area");
        var atHundredX = await Handle("surface-area");

        Assert.Equal("cached", atOneX.Status);
        Assert.Equal(atOneX.Result, atHundredX.Result);
        // 3.041672 is the local area; 12.166688 was the world area of the instance that
        // happened to be measured first, and is exactly what must not be here.
        Assert.DoesNotContain("12.166688", atOneX.Result);
    }

    [Fact]
    public async Task Other_Metrics_Are_Untouched_By_The_Space_Check()
    {
        // manifold is a function of the geometry however it is transformed, so it never
        // carried a space and must not start being refused for the lack of one.
        Cached("manifold", """{"isManifold":false,"boundaryEdges":480}""");

        var result = await Handle("manifold");

        Assert.Equal("cached", result.Status);
        Assert.Contains("480", result.Result);
    }

    [Fact]
    public async Task A_Missing_Row_Is_Still_Pending()
    {
        _repo.Setup(r => r.GetAsync(Hash, 1, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ComputeCacheEntry?)null);

        Assert.Equal("pending", (await Handle("surface-area")).Status);
    }

    private void Cached(string metric, string payload) =>
        _repo.Setup(r => r.GetAsync(Hash, 1, metric, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ComputeCacheEntry.Create(
                Hash, 1, metric, payload, new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc)));

    private async Task<ComputeResultResponse> Handle(string metric)
    {
        var result = await _handler.Handle(
            new GetComputeResultQuery(Hash, 1, metric), CancellationToken.None);
        Assert.True(result.IsSuccess);
        return result.Value;
    }
}
