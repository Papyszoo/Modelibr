using Application.Search;
using Xunit;

namespace Application.Tests.Search;

public class ImportFolderSignalTests
{
    [Fact]
    public void Segments_Returns_The_Deepest_Folders_First()
    {
        var segments = ImportFolderSignal.Segments("/library/POLYGONCity/SourceFiles/Characters");

        // SourceFiles is a pipeline stage, not a kind of asset, so it never reaches the caller.
        Assert.Equal(new[] { "Characters", "POLYGONCity" }, segments);
    }

    [Fact]
    public void Segments_Drops_Containers_And_Formats_And_Stops_At_The_Machine_Path()
    {
        var segments = ImportFolderSignal.Segments("/Users/someone/Downloads/Assets/FBX/Vehicles");

        // Assets and FBX are containers and are skipped over. Downloads is different: it
        // ends the climb, because the folder above it is a username, and a username must
        // never become a tag on somebody's whole library.
        Assert.Equal(new[] { "Vehicles" }, segments);
    }

    [Fact]
    public void Segments_Reads_At_Most_Three_Levels()
    {
        var segments = ImportFolderSignal.Segments("/one/two/three/four/five");

        Assert.Equal(new[] { "five", "four", "three" }, segments);
    }

    [Fact]
    public void Segments_Handles_Windows_Paths_And_Drive_Letters()
    {
        var segments = ImportFolderSignal.Segments(@"D:\Kits\Medieval\Weapons");

        Assert.Equal(new[] { "Weapons", "Medieval", "Kits" }, segments);
    }

    [Fact]
    public void Segments_Of_Nothing_Is_Empty()
    {
        Assert.Empty(ImportFolderSignal.Segments(null));
        Assert.Empty(ImportFolderSignal.Segments("   "));
        // A path made only of containers has no taxonomy in it, which is not the same as
        // a path that says nothing - both correctly yield nothing to index.
        Assert.Empty(ImportFolderSignal.Segments("/assets/models/fbx"));
    }

    [Fact]
    public void Tokens_Widen_The_Way_Authored_Names_Do()
    {
        var tokens = ImportFolderSignal.Tokens("/pack/SM_Veh_Cars");

        // The point of the whole feature: a folder named in the pack's shorthand still
        // reaches the word a person searches by.
        Assert.Contains("vehicle", tokens);
    }

    [Fact]
    public void TagCandidates_Keep_The_Authored_Spelling_And_Stop_At_Two()
    {
        var tags = ImportFolderSignal.TagCandidates("/library/Medieval/Props/Barrels");

        Assert.Equal(new[] { "Barrels", "Props" }, tags);
    }

    [Fact]
    public void SharedSiblingTokens_Returns_What_Every_Neighbour_Carries()
    {
        var shared = ImportFolderSignal.SharedSiblingTokens(
            new[]
            {
                "SM_Veh_Car_01.fbx", "SM_Veh_Truck_02.fbx", "SM_Veh_Bus_03.fbx",
                "SM_Veh_Wheel_04.fbx",
            },
            ownName: "SM_Veh_Wheel_04.fbx");

        Assert.Contains("veh", shared);
        // The prefix resolves to the concept, which is what makes the wheel classifiable.
        Assert.Contains("vehicle", shared);
        Assert.DoesNotContain("car", shared);
    }

    [Fact]
    public void SharedSiblingTokens_Needs_Several_Neighbours_To_Call_It_A_Convention()
    {
        var shared = ImportFolderSignal.SharedSiblingTokens(
            new[] { "SM_Veh_Car_01.fbx", "SM_Veh_Truck_02.fbx" },
            ownName: "SM_Veh_Car_01.fbx");

        // One other file sharing a prefix is a coincidence.
        Assert.Empty(shared);
    }

    [Fact]
    public void SelectTextureSiblings_Takes_Everything_In_A_Single_Model_Folder()
    {
        var chosen = ImportFolderSignal.SelectTextureSiblings(
            "Chair.obj",
            new[] { "wood.png", "fabric_normal.png", "textures/ao.png" },
            modelFileCount: 1);

        Assert.Equal(3, chosen.Count);
    }

    [Fact]
    public void SelectTextureSiblings_Takes_Only_Name_Matches_From_A_Shared_Folder()
    {
        // The POLYGON City layout: 696 models beside one texture library. Taking every
        // image for every model would be 139,000 auxiliary rows.
        var chosen = ImportFolderSignal.SelectTextureSiblings(
            "SM_Bld_Apartment_01.fbx",
            new[] { "PolygonCity_Texture_01.png", "SM_Bld_Apartment_Albedo.png", "Sky.png" },
            modelFileCount: 696);

        Assert.Equal(new[] { "SM_Bld_Apartment_Albedo.png" }, chosen);
    }

    [Fact]
    public void SelectTextureSiblings_Of_Nothing_Is_Empty()
    {
        Assert.Empty(ImportFolderSignal.SelectTextureSiblings("Chair.obj", null, 1));
        Assert.Empty(ImportFolderSignal.SelectTextureSiblings(null, new[] { "wood.png" }, 1));
    }
}
