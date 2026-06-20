using Domain.ValueObjects;
using Infrastructure.Services;
using Infrastructure.Tests.Fakes;
using Microsoft.Extensions.Logging.Abstractions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Tests.Services;

public class TextureImageMetadataReaderTests
{
    private static string CreateTempRoot()
    {
        var p = Path.Combine(Path.GetTempPath(), "modelibr_tests", Path.GetRandomFileName());
        Directory.CreateDirectory(p);
        return p;
    }

    private static DomainFile CreateTextureFile(string relativePath)
        => DomainFile.Create(
            "texture.png",
            "stored_texture.png",
            relativePath,
            "image/png",
            FileType.Texture,
            1024L,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
            DateTime.UtcNow);

    [Fact]
    public async Task ReadAsync_WithRealPng_ReturnsDimensionsAndFormat()
    {
        var root = CreateTempRoot();
        var relativePath = Path.Combine("ab", "cd", "texture.png");
        var fullPath = Path.Combine(root, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        using (var image = new Image<Rgba32>(640, 480))
        {
            await image.SaveAsPngAsync(fullPath);
        }

        var reader = new TextureImageMetadataReader(
            new FakeUploadPathProvider(root),
            NullLogger<TextureImageMetadataReader>.Instance);

        var result = await reader.ReadAsync(CreateTextureFile(relativePath), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(640, result!.Width);
        Assert.Equal(480, result.Height);
        Assert.Equal("png", result.Format);
    }

    [Fact]
    public async Task ReadAsync_WhenFileMissing_ReturnsNull()
    {
        var reader = new TextureImageMetadataReader(
            new FakeUploadPathProvider(CreateTempRoot()),
            NullLogger<TextureImageMetadataReader>.Instance);

        var result = await reader.ReadAsync(CreateTextureFile(Path.Combine("missing", "texture.png")), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task ReadAsync_WhenFileIsNotAnImage_ReturnsNull()
    {
        var root = CreateTempRoot();
        var relativePath = "garbage.png";
        await File.WriteAllTextAsync(Path.Combine(root, relativePath), "not really an image");

        var reader = new TextureImageMetadataReader(
            new FakeUploadPathProvider(root),
            NullLogger<TextureImageMetadataReader>.Instance);

        var result = await reader.ReadAsync(CreateTextureFile(relativePath), CancellationToken.None);

        Assert.Null(result);
    }
}
