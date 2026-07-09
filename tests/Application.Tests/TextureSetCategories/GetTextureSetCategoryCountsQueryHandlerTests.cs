using Application.Abstractions.Repositories;
using Application.TextureSetCategories;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.TextureSetCategories;

public class GetTextureSetCategoryCountsQueryHandlerTests
{
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly GetTextureSetCategoryCountsQueryHandler _handler;

    public GetTextureSetCategoryCountsQueryHandlerTests()
    {
        _handler = new GetTextureSetCategoryCountsQueryHandler(
            _textureSetRepository.Object);
    }

    [Theory]
    [InlineData(TextureSetKind.Universal)]
    [InlineData(TextureSetKind.ModelSpecific)]
    public async Task Handle_ScopesCountsToRequestedKind(TextureSetKind kind)
    {
        // Categories are strictly per-kind (Universal vs ModelSpecific); the
        // query's Kind must reach the repository so the badges never mix
        // vocabularies across kinds.
        _textureSetRepository
            .Setup(r => r.GetCategoryAssetCountsAsync(
                kind, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CategoryAssetCounts(
                new Dictionary<int, int> { [3] = 6 },
                UncategorizedCount: 4,
                TotalCount: 10));

        var result = await _handler.Handle(
            new GetTextureSetCategoryCountsQuery(kind), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(4, result.Value.UncategorizedCount);
        Assert.Equal(10, result.Value.TotalCount);
        var only = Assert.Single(result.Value.Categories);
        Assert.Equal(3, only.CategoryId);
        Assert.Equal(6, only.Count);
        _textureSetRepository.Verify(
            r => r.GetCategoryAssetCountsAsync(kind, It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
