using System.Text;
using Application.Models;
using Xunit;

namespace Application.Tests.Models;

public class MultiFileImportGroupingTests
{
    private static MultiFileImportEntry Entry(string path) =>
        new(path, Encoding.UTF8.GetBytes(path));

    [Fact]
    public void Group_When_GltfSubfolder_Returns_Primary_With_Relative_Auxiliaries()
    {
        // A Khronos glTF-Sample-Assets layout: one .gltf with sibling .bin +
        // textures. The .bin/textures must group under the .gltf with the URI the
        // glTF references them by, or a multi-file import can't be resolved.
        var groups = MultiFileImportGrouping.Group(new[]
        {
            Entry("FlightHelmet/glTF/FlightHelmet.gltf"),
            Entry("FlightHelmet/glTF/FlightHelmet.bin"),
            Entry("FlightHelmet/glTF/FlightHelmet_baseColor.png"),
            Entry("FlightHelmet/glTF/textures/wood.png"),
        });

        var group = Assert.Single(groups);
        Assert.Equal("FlightHelmet.gltf", group.Primary.FileName);
        var paths = group.Auxiliaries.Select(a => a.RelativePath).OrderBy(p => p, StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "FlightHelmet.bin", "FlightHelmet_baseColor.png", "textures/wood.png" }, paths);
    }

    [Fact]
    public void Group_When_TwoModels_Does_Not_Cross_Contaminate_Auxiliaries()
    {
        var groups = MultiFileImportGrouping.Group(new[]
        {
            Entry("Models/A/glTF/A.gltf"),
            Entry("Models/A/glTF/A.bin"),
            Entry("Models/B/glTF/B.gltf"),
            Entry("Models/B/glTF/B.bin"),
        });

        Assert.Equal(2, groups.Count);
        var a = Assert.Single(groups, g => g.Primary.FileName == "A.gltf");
        var b = Assert.Single(groups, g => g.Primary.FileName == "B.gltf");
        Assert.Equal(new[] { "A.bin" }, a.Auxiliaries.Select(x => x.RelativePath));
        Assert.Equal(new[] { "B.bin" }, b.Auxiliaries.Select(x => x.RelativePath));
    }

    [Fact]
    public void Group_When_SelfContainedGlb_Returns_No_Auxiliaries()
    {
        var groups = MultiFileImportGrouping.Group(new[] { Entry("kit/Barrel.glb") });

        var group = Assert.Single(groups);
        Assert.Empty(group.Auxiliaries);
    }

    [Fact]
    public void Group_When_NoPrimaryModelFile_Returns_Empty()
    {
        var groups = MultiFileImportGrouping.Group(new[]
        {
            Entry("textures/wood.png"),
            Entry("readme.txt"),
        });

        Assert.Empty(groups);
    }

    [Fact]
    public void Group_Normalizes_Backslashes_From_Windows_Archives()
    {
        var groups = MultiFileImportGrouping.Group(new[]
        {
            Entry("Prop\\glTF\\Prop.gltf"),
            Entry("Prop\\glTF\\Prop.bin"),
        });

        var group = Assert.Single(groups);
        Assert.Equal("Prop.gltf", group.Primary.FileName);
        Assert.Equal(new[] { "Prop.bin" }, group.Auxiliaries.Select(a => a.RelativePath));
    }
}
