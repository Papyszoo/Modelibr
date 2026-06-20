using Application.Abstractions.Repositories;
using Application.Search;
using Moq;
using Xunit;

namespace Application.Tests.Search;

public class GlobalSearchQueryHandlerTests
{
    private readonly Mock<ISearchRepository> _searchRepository = new();
    private readonly GlobalSearchQueryHandler _handler;

    public GlobalSearchQueryHandlerTests()
    {
        _handler = new GlobalSearchQueryHandler(_searchRepository.Object);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WhenTermBlank_ReturnsEmptyWithoutQueryingRepository(string term)
    {
        var result = await _handler.Handle(new GlobalSearchQuery(term), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Groups);
        _searchRepository.Verify(
            r => r.SearchAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenTermProvided_DelegatesTrimmedTermAndClampsLimit()
    {
        _searchRepository
            .Setup(r => r.SearchAsync("barrel", 25, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<SearchResultGroup>
            {
                new("model", 1, new List<SearchResultItem> { new("model", 7, "Barrel", "name") }),
            });

        var result = await _handler.Handle(
            new GlobalSearchQuery("  barrel  ", PerTypeLimit: 1000),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        var group = Assert.Single(result.Value.Groups);
        Assert.Equal("model", group.Type);
        // Limit clamped to the handler's max (25), not the requested 1000.
        _searchRepository.Verify(
            r => r.SearchAsync("barrel", 25, It.IsAny<CancellationToken>()), Times.Once);
    }
}
