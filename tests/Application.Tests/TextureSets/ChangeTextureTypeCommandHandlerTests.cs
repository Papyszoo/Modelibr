using Application.Abstractions.Repositories;
using Application.TextureSets;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.TextureSets;

public class ChangeTextureTypeCommandHandlerTests
{
    private readonly Mock<ITextureSetRepository> _mockTextureSetRepository;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly ChangeTextureTypeCommandHandler _handler;

    public ChangeTextureTypeCommandHandlerTests()
    {
        _mockTextureSetRepository = new Mock<ITextureSetRepository>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        
        _handler = new ChangeTextureTypeCommandHandler(
            _mockTextureSetRepository.Object,
            _mockDateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WhenTextureSetNotFound_ReturnsFailure()
    {
        // Arrange
        var command = new ChangeTextureTypeCommand(1, 1, TextureType.Normal);
        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("TextureSet.NotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenTextureNotFoundInSet_ReturnsFailure()
    {
        // Arrange
        var command = new ChangeTextureTypeCommand(1, 999, TextureType.Normal);
        var textureSet = CreateTextureSetWithTexture(1, TextureType.Albedo);
        
        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("Texture.NotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenChangingToSameType_ReturnsSuccess()
    {
        // Arrange
        var textureSet = CreateTextureSetWithTexture(1, TextureType.Albedo);
        var texture = textureSet.Textures.First();
        var command = new ChangeTextureTypeCommand(1, texture.Id, TextureType.Albedo);
        
        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Handle_WhenTargetTypeAlreadyExists_ReturnsFailure()
    {
        // Arrange
        var textureSet = CreateTextureSetWithMultipleTextures();
        var albedoTexture = textureSet.Textures.First(t => t.TextureType == TextureType.Albedo);
        var command = new ChangeTextureTypeCommand(1, albedoTexture.Id, TextureType.Normal);
        
        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("TextureType.AlreadyExists", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenValidRequest_UpdatesTextureTypeAndSaves()
    {
        // Arrange
        var now = DateTime.UtcNow;
        var textureSet = CreateTextureSetWithTexture(1, TextureType.Albedo);
        var texture = textureSet.Textures.First();
        var command = new ChangeTextureTypeCommand(1, texture.Id, TextureType.Normal);
        
        _mockTextureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        _mockTextureSetRepository.Setup(x => x.UpdateAsync(textureSet, It.IsAny<CancellationToken>()))
            .ReturnsAsync(textureSet);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(TextureType.Normal, texture.TextureType);
        Assert.Equal(now, texture.UpdatedAt);
        _mockTextureSetRepository.Verify(x => x.UpdateAsync(textureSet, It.IsAny<CancellationToken>()), Times.Once);
    }

    private static TextureSet CreateTextureSetWithTexture(int textureId, TextureType textureType)
    {
        var textureSet = TextureSet.Create("Test Set", DateTime.UtcNow);
        var file = CreateValidTextureFile();
        var texture = Texture.Create(file, textureType, DateTime.UtcNow);
        
        // Use reflection to set the Id since it's not settable through the factory method
        typeof(Texture).GetProperty("Id")!.SetValue(texture, textureId);
        
        textureSet.AddTexture(texture, DateTime.UtcNow);
        
        return textureSet;
    }

    private static TextureSet CreateTextureSetWithMultipleTextures()
    {
        var textureSet = TextureSet.Create("Test Set", DateTime.UtcNow);
        
        var albedoFile = CreateValidTextureFile();
        var albedoTexture = Texture.Create(albedoFile, TextureType.Albedo, DateTime.UtcNow);
        typeof(Texture).GetProperty("Id")!.SetValue(albedoTexture, 1);
        textureSet.AddTexture(albedoTexture, DateTime.UtcNow);
        
        var normalFile = CreateValidTextureFile();
        var normalTexture = Texture.Create(normalFile, TextureType.Normal, DateTime.UtcNow);
        typeof(Texture).GetProperty("Id")!.SetValue(normalTexture, 2);
        textureSet.AddTexture(normalTexture, DateTime.UtcNow);
        
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
