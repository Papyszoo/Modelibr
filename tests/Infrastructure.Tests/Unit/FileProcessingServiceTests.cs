using Domain.Models;
using Domain.Services;
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
    [InlineData("test.obj", FileType.Obj)]
    [InlineData("model.fbx", FileType.Fbx)]
    [InlineData("scene.gltf", FileType.Gltf)]
    [InlineData("asset.glb", FileType.Glb)]
    public void ValidateFileForModelUpload_WithRenderableFiles_ReturnsSuccess(string fileName, FileType expectedFileType)
    {
        // Act
        var result = _fileProcessingService.ValidateFileForModelUpload(fileName);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(expectedFileType, result.Value);
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
    [InlineData("test.obj", FileType.Obj)]
    [InlineData("texture.jpg", FileType.Texture)]
    [InlineData("project.blend", FileType.Blend)]
    [InlineData("material.mtl", FileType.Material)]
    public void ValidateFileForUpload_WithSupportedFiles_ReturnsSuccess(string fileName, FileType expectedFileType)
    {
        // Act
        var result = _fileProcessingService.ValidateFileForUpload(fileName);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(expectedFileType, result.Value);
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