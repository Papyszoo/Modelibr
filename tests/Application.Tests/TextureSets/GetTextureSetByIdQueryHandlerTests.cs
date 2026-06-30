using Application.Abstractions.Repositories;
using Application.TextureSets;
using Domain.Models;
using Moq;
using Xunit;

namespace Application.Tests.TextureSets;

public class GetTextureSetByIdQueryHandlerTests
{
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly Mock<ITextureSetCategoryRepository> _categoryRepository = new();
    private readonly GetTextureSetByIdQueryHandler _handler;

    public GetTextureSetByIdQueryHandlerTests()
    {
        _categoryRepository
            .Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<TextureSetCategory>());
        _handler = new GetTextureSetByIdQueryHandler(
            _textureSetRepository.Object,
            _categoryRepository.Object);
    }

    [Fact]
    public async Task Handle_WhenTextureSetNotFound_ReturnsFailure()
    {
        _textureSetRepository
            .Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet?)null);

        var result = await _handler.Handle(
            new GetTextureSetByIdQuery(99), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("TextureSetNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_MapsTagsOntoDetailDto_SortedByName()
    {
        // Regression: the detail DTO previously omitted Tags, so the viewer's
        // tag editor always showed "no tags" against the real backend even
        // though GetByIdAsync eager-loads them.
        var textureSet = TextureSet.Create("Rust", DateTime.UtcNow);
        textureSet.SetTags(
            new[]
            {
                ModelTag.Create("metal", DateTime.UtcNow),
                ModelTag.Create("aged", DateTime.UtcNow),
            },
            DateTime.UtcNow);
        _textureSetRepository
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        var result = await _handler.Handle(
            new GetTextureSetByIdQuery(1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new[] { "aged", "metal" }, result.Value.TextureSet.Tags);
    }

    [Fact]
    public async Task Handle_WhenNoTags_ReturnsEmptyTagList()
    {
        var textureSet = TextureSet.Create("Rust", DateTime.UtcNow);
        _textureSetRepository
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        var result = await _handler.Handle(
            new GetTextureSetByIdQuery(1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.TextureSet.Tags);
    }
}
