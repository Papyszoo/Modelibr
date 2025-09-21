using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;
using Xunit;

namespace Infrastructure.Tests.Unit;

public class FileProcessingServiceTests
{
    private readonly FileProcessingService _fileProcessingService;

    public FileProcessingServiceTests()
    {
        _fileProcessingService = new FileProcessingService();
    }

    [Theory]
    [InlineData("test.obj", "obj")]
    [InlineData("model.fbx", "fbx")]
    [InlineData("scene.gltf", "gltf")]
    [InlineData("asset.glb", "glb")]
    public void ValidateFileForModelUpload_WithRenderableFiles_ReturnsSuccess(string fileName, string expectedValue)
    {
        // Act
        var result = _fileProcessingService.ValidateFileForModelUpload(fileName);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(expectedValue, result.Value.Value);
    }

    [Theory]
    [InlineData("texture.jpg")]
    [InlineData("project.blend")]
    [InlineData("material.mtl")]
    [InlineData("unknown.xyz")]
    public void ValidateFileForModelUpload_WithNonRenderableFiles_ReturnsFailure(string fileName)
    {
        // Act
        var result = _fileProcessingService.ValidateFileForModelUpload(fileName);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidFileType", result.Error.Code);
    }

    [Fact]
    public void ValidateFileForModelUpload_WithNullFileName_ReturnsFailure()
    {
        // Act
        var result = _fileProcessingService.ValidateFileForModelUpload(null!);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidFileName", result.Error.Code);
    }

    [Theory]
    [InlineData("test.obj", "obj")]
    [InlineData("texture.jpg", "texture")]
    [InlineData("project.blend", "blend")]
    [InlineData("material.mtl", "material")]
    public void ValidateFileForUpload_WithSupportedFiles_ReturnsSuccess(string fileName, string expectedValue)
    {
        // Act
        var result = _fileProcessingService.ValidateFileForUpload(fileName);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(expectedValue, result.Value.Value);
    }

    [Fact]
    public void ValidateFileForUpload_WithUnsupportedFile_ReturnsFailure()
    {
        // Act
        var result = _fileProcessingService.ValidateFileForUpload("unknown.xyz");

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("UnsupportedFileType", result.Error.Code);
    }
}