using Application.Abstractions.Repositories;
using Application.TextureSets;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.TextureSets;

public class UpdateTextureSetTagsCommandHandlerTests
{
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly Mock<IModelTagRepository> _modelTagRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly UpdateTextureSetTagsCommandHandler _handler;

    public UpdateTextureSetTagsCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        _handler = new UpdateTextureSetTagsCommandHandler(
            _textureSetRepository.Object,
            _modelTagRepository.Object,
            _dateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WhenTextureSetNotFound_ReturnsFailure()
    {
        _textureSetRepository
            .Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet?)null);

        var result = await _handler.Handle(
            new UpdateTextureSetTagsCommand(99, new[] { "wood" }), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("TextureSetNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_ReusesExistingTagAndCreatesNewOne_FromSharedPool()
    {
        var textureSet = TextureSet.Create("Rust", DateTime.UtcNow);
        _textureSetRepository
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);
        _textureSetRepository
            .Setup(r => r.UpdateAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet ts, CancellationToken _) => ts);

        // "metal" already exists in the shared pool; "rusty" is new.
        var existing = ModelTag.Create("metal", DateTime.UtcNow);
        _modelTagRepository
            .Setup(r => r.GetByNormalizedNamesAsync(
                It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ModelTag> { existing });

        var result = await _handler.Handle(
            new UpdateTextureSetTagsCommand(1, new[] { "Metal", "Rusty" }), CancellationToken.None);

        Assert.True(result.IsSuccess);
        // The existing tag keeps its canonical casing ("metal"); only "Rusty" is new.
        Assert.Contains("metal", result.Value.Tags);
        Assert.Contains("Rusty", result.Value.Tags);
        Assert.Equal(2, result.Value.Tags.Count);
        // Exactly the one new tag is persisted to the shared pool.
        _modelTagRepository.Verify(
            r => r.AddRangeAsync(
                It.Is<IEnumerable<ModelTag>>(tags => tags.Count() == 1),
                It.IsAny<CancellationToken>()),
            Times.Once);
        Assert.Equal(2, textureSet.Tags.Count);
    }

    [Fact]
    public async Task Handle_WhenTagsEmpty_ClearsTagsWithoutCreatingAny()
    {
        var textureSet = TextureSet.Create("Rust", DateTime.UtcNow);
        textureSet.SetTags(new[] { ModelTag.Create("old", DateTime.UtcNow) }, DateTime.UtcNow);
        _textureSetRepository
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);
        _textureSetRepository
            .Setup(r => r.UpdateAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet ts, CancellationToken _) => ts);

        var result = await _handler.Handle(
            new UpdateTextureSetTagsCommand(1, Array.Empty<string>()), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(textureSet.Tags);
        _modelTagRepository.Verify(
            r => r.AddRangeAsync(It.IsAny<IEnumerable<ModelTag>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
