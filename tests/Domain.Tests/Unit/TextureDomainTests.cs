using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class TextureDomainTests
{
    [Fact]
    public void Create_WithValidTextureFileAndType_ReturnsTexture()
    {
        // Arrange
        var file = CreateValidTextureFile();
        var textureType = TextureType.Albedo;
        var createdAt = DateTime.UtcNow;

        // Act
        var texture = Texture.Create(file, textureType, createdAt);

        // Assert
        Assert.Equal(file.Id, texture.FileId);
        Assert.Equal(file, texture.File);
        Assert.Equal(textureType, texture.TextureType);
        Assert.Equal(createdAt, texture.CreatedAt);
        Assert.Equal(createdAt, texture.UpdatedAt);
    }

    [Fact]
    public void Create_WithNullFile_ThrowsArgumentNullException()
    {
        // Arrange
        DomainFile? file = null;
        var textureType = TextureType.Albedo;
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => Texture.Create(file!, textureType, createdAt));
    }

    [Fact]
    public void Create_WithUnsupportedTextureType_ThrowsArgumentException()
    {
        // Arrange
        var file = CreateValidTextureFile();
        var unsupportedType = (TextureType)999;
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => Texture.Create(file, unsupportedType, createdAt));
        Assert.Contains("not supported", exception.Message);
    }

    [Fact]
    public void Create_WithNonTextureFile_ThrowsArgumentException()
    {
        // Arrange
        var file = CreateValidModelFile(); // Create a 3D model file instead of texture
        var textureType = TextureType.Albedo;
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => Texture.Create(file, textureType, createdAt));
        Assert.Contains("not a texture", exception.Message);
        Assert.Contains("Only files with Texture category", exception.Message);
    }

    [Theory]
    [InlineData(TextureType.Albedo)]
    [InlineData(TextureType.Normal)]
    [InlineData(TextureType.Emissive)]
    public void UpdateTextureType_WithValidType_UpdatesTypeAndTimestamp(TextureType newTextureType)
    {
        // Arrange
        var file = CreateValidTextureFile();
        var originalType = TextureType.Albedo;
        var createdAt = DateTime.UtcNow.AddHours(-1);
        var updatedAt = DateTime.UtcNow;
        var texture = Texture.Create(file, originalType, createdAt);

        // Act
        texture.UpdateTextureType(newTextureType, updatedAt);

        // Assert
        Assert.Equal(newTextureType, texture.TextureType);
        Assert.Equal(updatedAt, texture.UpdatedAt);
        Assert.Equal(createdAt, texture.CreatedAt); // CreatedAt should not change
    }

    [Theory]
    [InlineData(TextureType.Height)]
    [InlineData(TextureType.AO)]
    [InlineData(TextureType.Roughness)]
    [InlineData(TextureType.Metallic)]
    public void UpdateTextureType_WithIncompatibleChannel_ThrowsArgumentException(TextureType newTextureType)
    {
        // Arrange
        var file = CreateValidTextureFile();
        var originalType = TextureType.Albedo; // Creates with RGB channel
        var createdAt = DateTime.UtcNow.AddHours(-1);
        var updatedAt = DateTime.UtcNow;
        var texture = Texture.Create(file, originalType, createdAt);

        // Act & Assert - trying to change to a grayscale type while having RGB channel should fail
        var exception = Assert.Throws<ArgumentException>(() => texture.UpdateTextureType(newTextureType, updatedAt));
        Assert.Contains("RGB channel can only be used with color texture types", exception.Message);
    }

    [Fact]
    public void UpdateTextureType_WithUnsupportedType_ThrowsArgumentException()
    {
        // Arrange
        var file = CreateValidTextureFile();
        var texture = Texture.Create(file, TextureType.Albedo, DateTime.UtcNow);
        var unsupportedType = (TextureType)999;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => texture.UpdateTextureType(unsupportedType, DateTime.UtcNow));
        Assert.Contains("not supported", exception.Message);
    }

    [Theory]
    [InlineData(TextureType.Albedo, TextureType.Albedo, true)]
    [InlineData(TextureType.Albedo, TextureType.Normal, false)]
    [InlineData(TextureType.Normal, TextureType.Normal, true)]
    [InlineData(TextureType.Roughness, TextureType.Metallic, false)]
    public void IsOfType_ReturnsCorrectResult(TextureType textureType, TextureType testType, bool expected)
    {
        // Arrange
        var file = CreateValidTextureFile();
        var texture = Texture.Create(file, textureType, DateTime.UtcNow);

        // Act
        var result = texture.IsOfType(testType);

        // Assert
        Assert.Equal(expected, result);
    }

    [Fact]
    public void GetDescription_ReturnsExpectedFormat()
    {
        // Arrange
        var file = CreateValidTextureFile();
        var textureType = TextureType.Albedo;
        var texture = Texture.Create(file, textureType, DateTime.UtcNow);

        // Act
        var description = texture.GetDescription();

        // Assert
        Assert.Contains(file.OriginalFileName, description);
        Assert.Contains("Base color map", description); // Description of Albedo type
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

    private static DomainFile CreateValidModelFile()
    {
        return DomainFile.Create(
            "model.obj",
            "stored_model.obj",
            "/path/to/model.obj",
            "model/obj",
            FileType.Obj,
            2048L,
            "b2c3d4e5f6789012345678901234567890123456789012345678901234a1b2c3",
            DateTime.UtcNow
        );
    }
}