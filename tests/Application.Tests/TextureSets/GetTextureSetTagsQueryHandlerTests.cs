using Application.Abstractions.Repositories;
using Application.TextureSets;
using Moq;
using Xunit;

namespace Application.Tests.TextureSets;

public class GetTextureSetTagsQueryHandlerTests
{
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly GetTextureSetTagsQueryHandler _handler;

    public GetTextureSetTagsQueryHandlerTests()
    {
        _handler = new GetTextureSetTagsQueryHandler(_textureSetRepository.Object);
    }

    [Fact]
    public async Task Handle_ReturnsTextureSetAssignedTags()
    {
        // Per-asset-type vocabulary: suggestions come from tags assigned to
        // texture sets, not the global model tag pool.
        _textureSetRepository
            .Setup(r => r.GetAssignedTagNamesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { "fabric", "metal" });

        var result = await _handler.Handle(new GetTextureSetTagsQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new[] { "fabric", "metal" }, result.Value.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task Handle_WhenNoTags_ReturnsEmpty()
    {
        _textureSetRepository
            .Setup(r => r.GetAssignedTagNamesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<string>());

        var result = await _handler.Handle(new GetTextureSetTagsQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Tags);
    }
}
