using Application.Abstractions.Repositories;
using Application.ModelCategories;
using Moq;
using Xunit;

namespace Application.Tests.ModelCategories;

public class GetModelCategoryCountsQueryHandlerTests
{
    private readonly Mock<IModelRepository> _modelRepository = new();
    private readonly GetModelCategoryCountsQueryHandler _handler;

    public GetModelCategoryCountsQueryHandlerTests()
    {
        _handler = new GetModelCategoryCountsQueryHandler(_modelRepository.Object);
    }

    [Fact]
    public async Task Handle_MapsRepositoryCountsIntoResponse()
    {
        // The badges must reflect true per-category totals, so the handler maps
        // the repository's grouped counts straight through: PerCategory dict ->
        // Categories list, plus the uncategorized/total buckets.
        _modelRepository
            .Setup(r => r.GetCategoryAssetCountsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CategoryAssetCounts(
                new Dictionary<int, int> { [10] = 3, [20] = 5 },
                UncategorizedCount: 2,
                TotalCount: 10));

        var result = await _handler.Handle(
            new GetModelCategoryCountsQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value.UncategorizedCount);
        Assert.Equal(10, result.Value.TotalCount);
        Assert.Equal(
            new[] { (10, 3), (20, 5) },
            result.Value.Categories
                .OrderBy(c => c.CategoryId)
                .Select(c => (c.CategoryId, c.Count)));
    }

    [Fact]
    public async Task Handle_WhenEmpty_ReturnsZeroTotals()
    {
        _modelRepository
            .Setup(r => r.GetCategoryAssetCountsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CategoryAssetCounts(
                new Dictionary<int, int>(),
                UncategorizedCount: 0,
                TotalCount: 0));

        var result = await _handler.Handle(
            new GetModelCategoryCountsQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Categories);
        Assert.Equal(0, result.Value.UncategorizedCount);
        Assert.Equal(0, result.Value.TotalCount);
    }
}
