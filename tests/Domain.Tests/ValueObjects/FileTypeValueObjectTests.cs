using Domain.ValueObjects;
using SharedKernel;
using Xunit;

namespace Domain.Tests.ValueObjects;

public class FileTypeValueObjectTests
{
    [Theory]
    [InlineData("test.obj", "obj")]
    [InlineData("model.fbx", "fbx")]
    [InlineData("scene.gltf", "gltf")]
    [InlineData("asset.glb", "glb")]
    [InlineData("project.blend", "blend")]
    [InlineData("scene.max", "max")]
    [InlineData("model.ma", "maya")]
    [InlineData("model.mb", "maya")]
    [InlineData("texture.jpg", "texture")]
    [InlineData("texture.png", "texture")]
    [InlineData("material.mtl", "material")]
    public void FromFileName_WithKnownExtensions_ReturnsCorrectFileType(string fileName, string expectedValue)
    {
        // Act
        var result = FileType.FromFileName(fileName);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(expectedValue, result.Value.Value);
    }

    [Theory]
    [InlineData("unknown.xyz")]
    [InlineData("file.unknown")]
    [InlineData("test.abc")]
    public void FromFileName_WithUnknownExtensions_ReturnsOtherFileType(string fileName)
    {
        // Act
        var result = FileType.FromFileName(fileName);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal("other", result.Value.Value);
    }

    [Theory]
    [InlineData("test.obj")]
    [InlineData("texture.jpg")]
    [InlineData("project.blend")]
    [InlineData("material.mtl")]
    public void ValidateForUpload_WithSupportedFiles_ReturnsSuccess(string fileName)
    {
        // Act
        var result = FileType.ValidateForUpload(fileName);

        // Assert
        Assert.True(result.IsSuccess);
    }

    [Fact]
    public void ValidateForUpload_WithUnknownExtension_ReturnsOtherFileType()
    {
        // Act
        var result = FileType.ValidateForUpload("unknown.xyz");

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal("other", result.Value.Value);
    }

    [Theory]
    [InlineData("test.obj")]
    [InlineData("model.fbx")]
    [InlineData("scene.gltf")]
    [InlineData("asset.glb")]
    public void ValidateForModelUpload_WithRenderableFiles_ReturnsSuccess(string fileName)
    {
        // Act
        var result = FileType.ValidateForModelUpload(fileName);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsRenderable);
    }

    [Theory]
    [InlineData("texture.jpg")]
    [InlineData("project.blend")]
    [InlineData("material.mtl")]
    [InlineData("unknown.xyz")]
    public void ValidateForModelUpload_WithNonRenderableFiles_ReturnsFailure(string fileName)
    {
        // Act
        var result = FileType.ValidateForModelUpload(fileName);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidFileType", result.Error.Code);
    }

    [Theory]
    [InlineData("test.obj")]
    [InlineData("model.fbx")]
    [InlineData("scene.gltf")]
    [InlineData("asset.glb")]
    public void IsRenderable_WithRenderableTypes_ReturnsTrue(string fileName)
    {
        // Arrange
        var fileType = FileType.FromFileName(fileName).Value;

        // Act & Assert
        Assert.True(fileType.IsRenderable);
    }

    [Theory]
    [InlineData("texture.jpg")]
    [InlineData("project.blend")]
    [InlineData("material.mtl")]
    public void IsRenderable_WithNonRenderableTypes_ReturnsFalse(string fileName)
    {
        // Arrange
        var fileType = FileType.FromFileName(fileName).Value;

        // Act & Assert
        Assert.False(fileType.IsRenderable);
    }

    [Fact]
    public void Equals_WithSameFileType_ReturnsTrue()
    {
        // Arrange
        var fileType1 = FileType.Obj;
        var fileType2 = FileType.Obj;

        // Act & Assert
        Assert.Equal(fileType1, fileType2);
        Assert.True(fileType1.Equals(fileType2));
    }

    [Fact]
    public void Equals_WithDifferentFileType_ReturnsFalse()
    {
        // Arrange
        var fileType1 = FileType.Obj;
        var fileType2 = FileType.Fbx;

        // Act & Assert
        Assert.NotEqual(fileType1, fileType2);
        Assert.False(fileType1.Equals(fileType2));
    }

    [Fact]
    public void GetHashCode_WithSameFileType_ReturnsSameHashCode()
    {
        // Arrange
        var fileType1 = FileType.Obj;
        var fileType2 = FileType.Obj;

        // Act & Assert
        Assert.Equal(fileType1.GetHashCode(), fileType2.GetHashCode());
    }
}