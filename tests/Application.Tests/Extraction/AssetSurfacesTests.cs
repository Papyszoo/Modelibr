using Application.Extraction;
using Xunit;

namespace Application.Tests.Extraction;

/// <summary>
/// The surfaces an asset offers, derived from its measured part boxes.
///
/// This exists because anchoring rests a node on the target's whole-asset bounding-box top,
/// which is right by luck for a table and wrong for anything with structure: it puts a
/// cushion on a sofa's back and a book above a shelf rather than on it. The parts were
/// always measured; nothing turned them into the one number placement consumes.
/// </summary>
public class AssetSurfacesTests
{
    private static (string, AssetPartBounds?) Part(
        string path, double minX, double minY, double minZ, double maxX, double maxY, double maxZ) =>
        (path, new AssetPartBounds(
            new[] { minX, minY, minZ },
            new[] { maxX, maxY, maxZ },
            new[] { maxX - minX, maxY - minY, maxZ - minZ }));

    [Fact]
    public void A_Sofas_Seat_And_Back_Are_Two_Surfaces_At_Different_Heights()
    {
        // The case that motivated this. Anchoring to the sofa uses the whole-asset top -
        // the back, at 0.8 - when what a cushion wants is the seat at 0.45.
        var surfaces = AssetSurfaces.From([
            Part("/Sofa/Seat", -1, 0, -0.4, 1, 0.45, 0.4),
            Part("/Sofa/Back", -1, 0.45, 0.3, 1, 0.8, 0.4),
        ]);

        Assert.Equal([0.45, 0.8], surfaces.Select(s => s.Height).OrderBy(h => h));
    }

    [Fact]
    public void Each_Surface_Carries_The_Index_A_Placement_Names_It_By()
    {
        // place_asset(onSurface:) takes this number. Reported rather than left implicit in
        // the array order, because a caller that counts positions eventually miscounts.
        var surfaces = AssetSurfaces.From([
            Part("/Table/Top", -0.6, 0.7, -0.4, 0.6, 0.75, 0.4),
            Part("/Table/Shelf", -0.5, 0.2, -0.3, 0.5, 0.25, 0.3),
        ]);

        Assert.Equal([0, 1], surfaces.Select(s => s.Index));
    }

    [Fact]
    public void The_Dominant_Surface_Comes_First()
    {
        // "Largest first" is the whole ranking: an agent taking surfaces[0] should get the
        // table top, not the trim rail that happens to be higher.
        var surfaces = AssetSurfaces.From([
            Part("/Table/Top", -0.6, 0.7, -0.4, 0.6, 0.75, 0.4),
            Part("/Table/Rail", -0.6, 0.75, 0.35, 0.6, 0.8, 0.4),
        ]);

        Assert.Equal("/Table/Top", surfaces[0].Parts.Single());
    }

    [Fact]
    public void Two_Halves_Of_One_Top_Are_One_Place_To_Put_A_Lamp()
    {
        // Reporting them separately would offer two surfaces where a person sees one, and
        // halve the extent of each.
        var surfaces = AssetSurfaces.From([
            Part("/Desk/Left", -1, 0.7, -0.4, 0, 0.75, 0.4),
            Part("/Desk/Right", 0, 0.7, -0.4, 1, 0.75, 0.4),
        ]);

        var surface = Assert.Single(surfaces);
        Assert.Equal(2, surface.Extent[0], 4);
        Assert.Equal(2, surface.Parts.Count);
    }

    [Fact]
    public void Heights_Are_Stated_Above_The_Assets_Own_Base()
    {
        // Raw asset coordinates would be useless the moment the asset is placed anywhere but
        // the origin. Above-the-base survives being put down.
        var surfaces = AssetSurfaces.From([
            Part("/Shelf/Board", -0.5, 1.2, -0.2, 0.5, 1.25, 0.2),
            Part("/Shelf/Post", -0.5, 0.5, -0.2, -0.4, 1.25, 0.2),
        ]);

        Assert.Equal(0.75, surfaces[0].Height, 4);
    }

    [Fact]
    public void A_Fixing_Too_Small_To_Stand_Anything_On_Is_Not_Offered()
    {
        var surfaces = AssetSurfaces.From([
            Part("/Table/Top", -0.6, 0.7, -0.4, 0.6, 0.75, 0.4),
            Part("/Table/Screw", 0, 0.75, 0, 0.01, 0.76, 0.01),
        ]);

        Assert.Equal("/Table/Top", Assert.Single(surfaces).Parts.Single());
    }

    [Fact]
    public void An_Asset_Nothing_Measured_Reports_No_Surfaces_Rather_Than_Guessing()
    {
        // Silence about an asset is not the same as "it has no surfaces", and the caller
        // needs to be able to tell those apart before it stacks anything.
        Assert.Empty(AssetSurfaces.From([("/Group", null)]));
    }
}
