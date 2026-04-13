using Domain.Models;
using Domain.Tests;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class EnvironmentMapDomainTests
{
    [Fact]
    public void CreateCube_WhenMissingFace_ThrowsArgumentException()
    {
        var now = DateTime.UtcNow;
        var faceFiles = new Dictionary<EnvironmentMapCubeFace, DomainFile>
        {
            [EnvironmentMapCubeFace.Px] = CreateFile("px.hdr", now),
            [EnvironmentMapCubeFace.Nx] = CreateFile("nx.hdr", now),
            [EnvironmentMapCubeFace.Py] = CreateFile("py.hdr", now),
            [EnvironmentMapCubeFace.Ny] = CreateFile("ny.hdr", now),
            [EnvironmentMapCubeFace.Pz] = CreateFile("pz.hdr", now)
        };

        Assert.Throws<ArgumentException>(() => EnvironmentMapVariant.CreateCube(faceFiles, "2K", now));
    }

    [Fact]
    public void GetPreviewFile_WhenCubeVariant_ReturnsPzFace()
    {
        var now = DateTime.UtcNow;
        var pz = CreateFile("pz.hdr", now).WithId(6);
        var variant = EnvironmentMapVariant.CreateCube(
            new Dictionary<EnvironmentMapCubeFace, DomainFile>
            {
                [EnvironmentMapCubeFace.Px] = CreateFile("px.hdr", now).WithId(1),
                [EnvironmentMapCubeFace.Nx] = CreateFile("nx.hdr", now).WithId(2),
                [EnvironmentMapCubeFace.Py] = CreateFile("py.hdr", now).WithId(3),
                [EnvironmentMapCubeFace.Ny] = CreateFile("ny.hdr", now).WithId(4),
                [EnvironmentMapCubeFace.Pz] = pz,
                [EnvironmentMapCubeFace.Nz] = CreateFile("nz.hdr", now).WithId(5)
            },
            "2K",
            now);

        Assert.Equal(pz.Id, variant.GetPreviewFile()!.Id);
    }

    [Theory]
    [InlineData(1024, "1K")]
    [InlineData(4096, "4K")]
    [InlineData(6144, "6144px")]
    [InlineData(1500, "1500px")]
    public void FromDimension_WhenFormattingSizeLabel_ReturnsExpectedValue(int dimension, string expected)
    {
        var result = EnvironmentMapSizeLabel.FromDimension(dimension);

        Assert.Equal(expected, result);
    }

    [Fact]
    public void GetPreviewVariant_WhenCustomPixelVariantIsLargest_PrefersThatVariant()
    {
        var now = DateTime.UtcNow;
        var environmentMap = EnvironmentMap.Create("Sky", now);
        var fourKVariant = EnvironmentMapVariant.Create(CreateFile("4k.hdr", now).WithId(1), "4K", now).WithId(11);
        var customVariant = EnvironmentMapVariant.Create(CreateFile("6144.hdr", now).WithId(2), "6144px", now).WithId(12);

        environmentMap.AddVariant(fourKVariant, now);
        environmentMap.AddVariant(customVariant, now);
        environmentMap.SetPreviewVariant(null, now);

        Assert.Equal(customVariant.Id, environmentMap.GetPreviewVariant()!.Id);
    }

    private static DomainFile CreateFile(string fileName, DateTime createdAt)
    {
        return DomainFile.Create(
            fileName,
            fileName,
            $"/uploads/{fileName}",
            FileType.Hdr.GetMimeType(),
            FileType.Hdr,
            1024,
            "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            createdAt);
    }
}
