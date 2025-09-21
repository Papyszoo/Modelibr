using Domain.ValueObjects;
using SharedKernel;
using Xunit;

namespace Infrastructure.Tests.Unit;

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

    [Fact]
    public void FromFileName_WithUnknownExtension_ReturnsOtherFileType()
    {
        // Act
        var result = FileType.FromFileName("unknown.xyz");

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal("other", result.Value.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void FromFileName_WithInvalidFileName_ReturnsFailure(string fileName)
    {
        // Act
        var result = FileType.FromFileName(fileName);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidFileName", result.Error.Code);
    }

    [Fact]
    public void FromFileName_WithNullFileName_ReturnsFailure()
    {
        // Act
        var result = FileType.FromFileName(null!);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidFileName", result.Error.Code);
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
    public void ValidateForUpload_WithUnsupportedFile_ReturnsFailure()
    {
        // Act
        var result = FileType.ValidateForUpload("unknown.xyz");

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("UnsupportedFileType", result.Error.Code);
    }

    [Fact]
    public void FileType_Equality_WorksCorrectly()
    {
        // Arrange
        var obj1 = FileType.Obj;
        var obj2 = FileType.Obj;
        var fbx = FileType.Fbx;

        // Assert
        Assert.Equal(obj1, obj2);
        Assert.True(obj1 == obj2);
        Assert.NotEqual(obj1, fbx);
        Assert.True(obj1 != fbx);
    }

    [Fact]
    public void GetRenderableTypes_ReturnsOnlyRenderableFileTypes()
    {
        // Act
        var renderableTypes = FileType.GetRenderableTypes();

        // Assert
        Assert.Equal(4, renderableTypes.Count);
        Assert.Contains(FileType.Obj, renderableTypes);
        Assert.Contains(FileType.Fbx, renderableTypes);
        Assert.Contains(FileType.Gltf, renderableTypes);
        Assert.Contains(FileType.Glb, renderableTypes);
    }

    [Fact]
    public void GetMimeType_ReturnsCorrectMimeTypes()
    {
        // Assert
        Assert.Equal("model/obj", FileType.Obj.GetMimeType());
        Assert.Equal("model/gltf+json", FileType.Gltf.GetMimeType());
        Assert.Equal("model/gltf-binary", FileType.Glb.GetMimeType());
        Assert.Equal("application/x-blender", FileType.Blend.GetMimeType());
        Assert.Equal("text/plain", FileType.Material.GetMimeType());
    }

    [Fact]
    public void ToString_ReturnsDescription()
    {
        // Assert
        Assert.Equal("Wavefront OBJ", FileType.Obj.ToString());
        Assert.Equal("glTF JSON", FileType.Gltf.ToString());
        Assert.Equal("Blender Project", FileType.Blend.ToString());
    }
}