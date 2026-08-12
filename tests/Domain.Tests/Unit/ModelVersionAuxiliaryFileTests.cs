using Domain.Models;
using Xunit;
using DomainFile = Domain.Models.File;
using Domain.ValueObjects;

namespace Domain.Tests.Unit;

public class ModelVersionAuxiliaryFileTests
{
    private static DomainFile SampleFile() =>
        DomainFile.Create(
            "scene.bin", "stored", "path/stored", "application/octet-stream",
            FileType.Other, 10, new string('a', 64), new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

    [Theory]
    [InlineData("./scene.bin", "scene.bin")]
    [InlineData("/textures/wood.png", "textures/wood.png")]
    [InlineData("textures\\wood.png", "textures/wood.png")]
    [InlineData("  scene.bin  ", "scene.bin")]
    public void NormalizeRelativePath_Normalizes_To_ForwardSlash_NoLeadingSlash(string input, string expected)
    {
        Assert.Equal(expected, ModelVersionAuxiliaryFile.NormalizeRelativePath(input));
    }

    [Theory]
    [InlineData("../secret.bin")]
    [InlineData("textures/../../etc/passwd")]
    public void NormalizeRelativePath_Rejects_Traversal(string input)
    {
        // Aux paths are resolved against uploaded siblings only - a '..' segment
        // must never be accepted (it is content-addressed storage, but the guard
        // keeps the recorded path honest and blocks any path-based consumer).
        Assert.Throws<ArgumentException>(() => ModelVersionAuxiliaryFile.NormalizeRelativePath(input));
    }

    [Fact]
    public void Create_Sets_Version_File_And_Normalized_Path()
    {
        var file = SampleFile();
        var now = new DateTime(2026, 1, 2, 0, 0, 0, DateTimeKind.Utc);

        var link = ModelVersionAuxiliaryFile.Create(42, file, "./textures\\wood.png", now);

        Assert.Equal(42, link.ModelVersionId);
        Assert.Same(file, link.File);
        Assert.Equal("textures/wood.png", link.RelativePath);
        Assert.Equal(now, link.CreatedAt);
    }

    [Fact]
    public void Create_Rejects_Nonpositive_Version()
    {
        Assert.Throws<ArgumentException>(() =>
            ModelVersionAuxiliaryFile.Create(0, SampleFile(), "scene.bin", DateTime.UtcNow));
    }

    [Fact]
    public void Create_Rejects_Empty_Path()
    {
        Assert.Throws<ArgumentException>(() =>
            ModelVersionAuxiliaryFile.Create(1, SampleFile(), "   ", DateTime.UtcNow));
    }
}
