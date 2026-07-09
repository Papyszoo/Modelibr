using Application.Abstractions.Repositories;
using Application.EnvironmentMapCategories;
using Moq;
using Xunit;

namespace Application.Tests.EnvironmentMapCategories;

public class GetEnvironmentMapCategoryCountsQueryHandlerTests
{
    private readonly Mock<IEnvironmentMapRepository> _environmentMapRepository = new();
    private readonly GetEnvironmentMapCategoryCountsQueryHandler _handler;

    public GetEnvironmentMapCategoryCountsQueryHandlerTests()
    {
        _handler = new GetEnvironmentMapCategoryCountsQueryHandler(
            _environmentMapRepository.Object);
    }

    [Fact]
    public async Task Handle_MapsRepositoryCountsIntoResponse()
    {
        _environmentMapRepository
            .Setup(r => r.GetCategoryAssetCountsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CategoryAssetCounts(
                new Dictionary<int, int> { [7] = 4 },
                UncategorizedCount: 1,
                TotalCount: 5));

        var result = await _handler.Handle(
            new GetEnvironmentMapCategoryCountsQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.UncategorizedCount);
        Assert.Equal(5, result.Value.TotalCount);
        var only = Assert.Single(result.Value.Categories);
        Assert.Equal(7, only.CategoryId);
        Assert.Equal(4, only.Count);
    }
}
