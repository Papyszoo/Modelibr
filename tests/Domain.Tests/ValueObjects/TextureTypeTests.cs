using Domain.ValueObjects;
using SharedKernel;
using Xunit;

namespace Domain.Tests.ValueObjects;

public class TextureTypeTests
{
    [Theory]
    [InlineData(TextureType.Albedo)]
    [InlineData(TextureType.Normal)]
    [InlineData(TextureType.Height)]
    [InlineData(TextureType.AO)]
    [InlineData(TextureType.Roughness)]
    [InlineData(TextureType.Metallic)]
    [InlineData(TextureType.Diffuse)]
    [InlineData(TextureType.Specular)]
    public void ValidateForStorage_WithSupportedTypes_ReturnsSuccess(TextureType textureType)
    {
        // Act
        var result = textureType.ValidateForStorage();

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(textureType, result.Value);
    }

    [Fact]
    public void ValidateForStorage_WithUnsupportedType_ReturnsFailure()
    {
        // Arrange
        var unsupportedType = (TextureType)999;

        // Act
        var result = unsupportedType.ValidateForStorage();

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("UnsupportedTextureType", result.Error.Code);
        Assert.Contains("not supported", result.Error.Message);
    }

    [Fact]
    public void GetSupportedTypes_ReturnsAllExpectedTypes()
    {
        // Act
        var supportedTypes = TextureTypeExtensions.GetSupportedTypes();

        // Assert
        Assert.Equal(8, supportedTypes.Count);
        Assert.Contains(TextureType.Albedo, supportedTypes);
        Assert.Contains(TextureType.Normal, supportedTypes);
        Assert.Contains(TextureType.Height, supportedTypes);
        Assert.Contains(TextureType.AO, supportedTypes);
        Assert.Contains(TextureType.Roughness, supportedTypes);
        Assert.Contains(TextureType.Metallic, supportedTypes);
        Assert.Contains(TextureType.Diffuse, supportedTypes);
        Assert.Contains(TextureType.Specular, supportedTypes);
    }

    [Theory]
    [InlineData(TextureType.Albedo, "Base color or diffuse map")]
    [InlineData(TextureType.Normal, "Normal map for surface detail")]
    [InlineData(TextureType.Height, "Height or displacement map")]
    [InlineData(TextureType.AO, "Ambient Occlusion map")]
    [InlineData(TextureType.Roughness, "Surface roughness map")]
    [InlineData(TextureType.Metallic, "Metallic surface map")]
    [InlineData(TextureType.Diffuse, "Diffuse color map (legacy)")]
    [InlineData(TextureType.Specular, "Specular reflectivity map")]
    public void GetDescription_ReturnsCorrectDescription(TextureType textureType, string expectedDescription)
    {
        // Act
        var description = textureType.GetDescription();

        // Assert
        Assert.Equal(expectedDescription, description);
    }

    [Fact]
    public void GetDescription_WithUnknownType_ReturnsUnknownMessage()
    {
        // Arrange
        var unknownType = (TextureType)999;

        // Act
        var description = unknownType.GetDescription();

        // Assert
        Assert.Equal("Unknown texture type", description);
    }
}