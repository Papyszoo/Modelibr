using Application.Abstractions.Repositories;
using Application.TextureSets;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.TextureSets;

public class UpdateTextureSetFileMetadataCommandHandlerTests
{
    private readonly Mock<ITextureSetRepository> _mockTextureSetRepository = new();
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider = new();
    private readonly UpdateTextureSetFileMetadataCommandHandler _handler;

    public UpdateTextureSetFileMetadataCommandHandlerTests()
    {
        _handler = new UpdateTextureSetFileMetadataCommandHandler(
            _mockTextureSetRepository.Object,
            _mockDateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WhenTextureSetNotFound_ReturnsFailure()
    {
        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet?)null);

        var result = await _handler.Handle(
            new UpdateTextureSetFileMetadataCommand(1, new[] { new TextureFileMetadataItem(1, 2048, 2048, "png") }),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("TextureSet.NotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WithMatchingTexture_StoresDimensionsAndSaves()
    {
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        var textureSet = CreateTextureSetWithTexture(5, TextureType.Albedo);
        var texture = textureSet.Textures.First();

        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);
        _mockTextureSetRepository.Setup(x => x.UpdateAsync(textureSet, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        var result = await _handler.Handle(
            new UpdateTextureSetFileMetadataCommand(1, new[] { new TextureFileMetadataItem(texture.Id, 4096, 2048, "PNG") }),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(4096, texture.Width);
        Assert.Equal(2048, texture.Height);
        Assert.Equal("png", texture.Format);
        _mockTextureSetRepository.Verify(x => x.UpdateAsync(textureSet, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenNoTextureMatches_DoesNotSave()
    {
        var textureSet = CreateTextureSetWithTexture(5, TextureType.Albedo);
        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        var result = await _handler.Handle(
            new UpdateTextureSetFileMetadataCommand(1, new[] { new TextureFileMetadataItem(999, 4096, 4096, "png") }),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        _mockTextureSetRepository.Verify(x => x.UpdateAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private static TextureSet CreateTextureSetWithTexture(int textureId, TextureType textureType)
    {
        var textureSet = TextureSet.Create("Test Set", DateTime.UtcNow);
        var texture = Texture.Create(CreateValidTextureFile(), textureType, DateTime.UtcNow);
        typeof(Texture).GetProperty("Id")!.SetValue(texture, textureId);
        textureSet.AddTexture(texture, DateTime.UtcNow);
        return textureSet;
    }

    private static DomainFile CreateValidTextureFile()
    {
        return DomainFile.Create(
            "texture.jpg",
            "stored_texture.jpg",
            "/path/to/texture.jpg",
            "image/jpeg",
            FileType.Texture,
            1024L,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
            DateTime.UtcNow
        );
    }
}
