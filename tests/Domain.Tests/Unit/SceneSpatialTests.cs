using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// Spatial truth for an agent that cannot see. These are the numbers that decide whether
/// "place it on the ground" puts a lamp post on the pavement or buries it to its waist, so
/// they are asserted against hand-computed values rather than against the implementation.
/// </summary>
public class SceneSpatialTests
{
    private const string ModelType = SceneAssetTypes.Model;

    private static SceneNode Node(string id, Vec3 position, Vec3? scale = null, Vec3? rotation = null, int assetId = 1) =>
        new(
            id,
            new SceneTransform(position, rotation ?? Vec3.Zero, scale ?? Vec3.One),
            Asset: new SceneAssetRef(ModelType, assetId, 1));

    private static Dictionary<string, SceneAssetFacts> Facts(
        Vec3 dimensions, string? origin = null, int assetId = 1, double? gridSize = null, Vec3? originInBounds = null)
    {
        var reference = new SceneAssetRef(ModelType, assetId, 1);
        return new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal)
        {
            [SceneSpatial.FactsKey(reference)] = new(ModelType, assetId, 1, dimensions, origin, gridSize, originInBounds),
        };
    }

    /// <summary>The origin on the bottom face, centred in X/Z - how most of the library is authored.</summary>
    private static readonly Vec3 BaseAtOrigin = new(0.5, 0, 0.5);

    private static readonly Vec3 Centered = new(0.5, 0.5, 0.5);

    // --- resting surfaces (11-E) -------------------------------------------------------

    [Fact]
    public void SurfacePoint_Is_The_Named_Height_Above_The_Assets_Base()
    {
        // A 2x1x2 sofa standing on the floor. Its box top is y=1 - the back - and the seat
        // the caller means is 0.45 up from the base.
        var facts = Facts(new Vec3(2, 1, 2), "bottom-center", originInBounds: BaseAtOrigin);
        var node = Node("sofa", new Vec3(3, 0, -2));

        var point = SceneSpatial.SurfacePoint(node, facts[SceneSpatial.FactsKey(Reference())], 0.45, 0, 0);

        Assert.NotNull(point);
        Assert.Equal(0.45, point!.Value.Y, 6);
        Assert.Equal(3, point.Value.X, 6);
        Assert.Equal(-2, point.Value.Z, 6);

        // And the whole point: the box top is somewhere else entirely.
        Assert.Equal(1, SceneSpatial.AnchorReference(node, facts[SceneSpatial.FactsKey(Reference())])!.Value.Y, 6);
    }

    [Fact]
    public void SurfacePoint_Scales_With_The_Node()
    {
        // A surface height is in the asset's own metres. A node scaled to double size has
        // its seat twice as high, or a cushion placed on it hangs in mid-air.
        var facts = Facts(new Vec3(2, 1, 2), "bottom-center", originInBounds: BaseAtOrigin);
        var node = Node("sofa", Vec3.Zero, scale: new Vec3(2, 2, 2));

        var point = SceneSpatial.SurfacePoint(node, facts[SceneSpatial.FactsKey(Reference())], 0.45, 0, 0);

        Assert.Equal(0.9, point!.Value.Y, 6);
    }

    [Fact]
    public void SurfacePoint_Turns_The_Surfaces_Own_Offset_With_The_Node()
    {
        // The seat is 0.3 forward of the sofa's centre. Turn the sofa 90 degrees about Y and
        // the seat has to turn with it - otherwise every cushion in a rotated room lands
        // behind the furniture.
        var facts = Facts(new Vec3(2, 1, 2), "bottom-center", originInBounds: BaseAtOrigin);
        var node = Node("sofa", Vec3.Zero, rotation: new Vec3(0, 90, 0));

        var point = SceneSpatial.SurfacePoint(node, facts[SceneSpatial.FactsKey(Reference())], 0.45, 0, 0.3);

        Assert.Equal(0.3, point!.Value.X, 6);
        Assert.Equal(0.45, point.Value.Y, 6);
        Assert.Equal(0, point.Value.Z, 6);
    }

    [Fact]
    public void The_Difference_Between_A_Surface_And_The_Box_Top_Does_Not_Move_With_The_Node()
    {
        // This is what lets a surface be stored as an ordinary anchor offset, and what lets a
        // batch entry rest on a node the same batch has not grounded yet: the offset is a
        // difference between two points on the SAME node, so translating the node cancels.
        var facts = Facts(new Vec3(2, 1, 2), "bottom-center", originInBounds: BaseAtOrigin);
        var key = SceneSpatial.FactsKey(Reference());

        static double Delta(SceneNode node, SceneAssetFacts facts) =>
            SceneSpatial.SurfacePoint(node, facts, 0.45, 0, 0)!.Value.Y
            - SceneSpatial.AnchorReference(node, facts)!.Value.Y;

        Assert.Equal(
            Delta(Node("sofa", Vec3.Zero), facts[key]),
            Delta(Node("sofa", new Vec3(12, 7, -30)), facts[key]),
            9);
    }

    [Fact]
    public void SurfacePoint_Is_Null_Without_Derived_Bounds()
    {
        // Same rule as every other spatial answer here: no measurement, no guess.
        var node = Node("sofa", Vec3.Zero);

        Assert.Null(SceneSpatial.SurfacePoint(node, facts: null, 0.45, 0, 0));
    }

    private static SceneAssetRef Reference(int assetId = 1) => new(ModelType, assetId, 1);

    [Fact]
    public void Footprint_When_Origin_Is_Centered_Straddles_The_Position()
    {
        var facts = Facts(new Vec3(2, 4, 2), "centered");
        var node = Node("lamp", new Vec3(0, 0, 0));

        var box = SceneSpatial.Footprint(node, facts.Values.Single());

        Assert.NotNull(box);
        Assert.Equal(-2, box!.Value.Min.Y, 6);
        Assert.Equal(2, box.Value.Max.Y, 6);
    }

    [Fact]
    public void Footprint_When_Origin_Is_Bottom_Center_Sits_On_The_Position()
    {
        var facts = Facts(new Vec3(2, 4, 2), "bottom-center");
        var node = Node("lamp", new Vec3(0, 0, 0));

        var box = SceneSpatial.Footprint(node, facts.Values.Single());

        Assert.Equal(0, box!.Value.Min.Y, 6);
        Assert.Equal(4, box.Value.Max.Y, 6);
    }

    [Fact]
    public void Footprint_When_The_Asset_Has_No_Derived_Bounds_Returns_Null()
    {
        // Null rather than a guessed unit box: a fabricated footprint would make the
        // overlap check confidently wrong.
        Assert.Null(SceneSpatial.Footprint(Node("lamp", Vec3.Zero), facts: null));
    }

    [Fact]
    public void Footprint_When_Rotated_45_Degrees_Grows_To_Cover_The_Rotated_Box()
    {
        var facts = Facts(new Vec3(2, 1, 2), "centered");
        var node = Node("wall", Vec3.Zero, rotation: new Vec3(0, 45, 0));

        var box = SceneSpatial.Footprint(node, facts.Values.Single());

        // A 2×2 square turned 45° spans 2·√2 ≈ 2.828 on both ground axes.
        Assert.Equal(2 * Math.Sqrt(2), box!.Value.Size.X, 5);
        Assert.Equal(2 * Math.Sqrt(2), box.Value.Size.Z, 5);
    }

    [Fact]
    public void GroundedY_When_Origin_Is_Centered_Lifts_The_Node_By_Half_Its_Height()
    {
        var facts = Facts(new Vec3(2, 4, 2), "centered");
        var node = Node("lamp", Vec3.Zero);

        Assert.Equal(2, SceneSpatial.GroundedY(node, facts.Values.Single())!.Value, 6);
    }

    [Fact]
    public void GroundedY_When_Origin_Is_Bottom_Center_Leaves_The_Node_Where_It_Is()
    {
        var facts = Facts(new Vec3(2, 4, 2), "bottom-center");

        Assert.Equal(0, SceneSpatial.GroundedY(Node("lamp", Vec3.Zero), facts.Values.Single())!.Value, 6);
    }

    [Fact]
    public void GroundedY_When_Bounds_Are_Unknown_Returns_Null()
    {
        Assert.Null(SceneSpatial.GroundedY(Node("lamp", Vec3.Zero), facts: null));
    }

    /// <summary>
    /// The bug that made every scene levitate: the library is base-at-origin, the derived
    /// origin was never measured, and an unmeasured origin was read as centred - so
    /// "ground it" lifted each object by half its own height and the footprint reported back
    /// to check said <c>minY = 0</c> because it shared the assumption.
    ///
    /// Both conventions, each unrotated and turned 90° about X, because that rotation is
    /// every wall panel in the scene and it swaps which local axis becomes world Y.
    /// </summary>
    [Theory]
    [InlineData(0.0, 0.0)]  // base-at-origin, unrotated
    [InlineData(0.0, 90.0)] // base-at-origin, laid down
    [InlineData(0.5, 0.0)]  // centred, unrotated
    [InlineData(0.5, 90.0)] // centred, laid down
    public void GroundedY_Rests_The_Base_On_Zero_For_Either_Origin_Convention(double yFraction, double pitch)
    {
        var facts = Facts(new Vec3(2, 4, 2), origin: null, originInBounds: new Vec3(0.5, yFraction, 0.5))
            .Values.Single();
        var node = Node("asset", new Vec3(3, 17, -5), rotation: new Vec3(pitch, 0, 0));

        var grounded = SceneSpatial.GroundedY(node, facts);

        Assert.NotNull(grounded);
        var rested = node with { Transform = node.Transform with { Position = node.Transform.Position with { Y = grounded!.Value } } };
        Assert.Equal(0, SceneSpatial.Footprint(rested, facts)!.Value.Min.Y, 6);
    }

    [Fact]
    public void Footprint_When_The_Origin_Is_At_The_Base_Sits_On_The_Position()
    {
        var facts = Facts(new Vec3(2, 4, 2), origin: null, originInBounds: BaseAtOrigin);

        var box = SceneSpatial.Footprint(Node("sofa", Vec3.Zero), facts.Values.Single());

        Assert.Equal(0, box!.Value.Min.Y, 6);
        Assert.Equal(4, box.Value.Max.Y, 6);
    }

    [Fact]
    public void Footprint_Prefers_The_Measured_Origin_Over_The_Convention_Label()
    {
        // A label and a measurement that disagree: the measurement is the one that came off
        // the geometry, so it wins. The label is a three-way summary of it.
        var facts = Facts(new Vec3(2, 4, 2), origin: "centered", originInBounds: BaseAtOrigin);

        Assert.Equal(0, SceneSpatial.Footprint(Node("sofa", Vec3.Zero), facts.Values.Single())!.Value.Min.Y, 6);
    }

    [Fact]
    public void Footprint_When_The_Origin_Is_Off_Centre_Uses_The_Exact_Fraction()
    {
        // The case no label can express: origin at the base, a quarter of the way along X.
        // Before the fraction existed this fell through to "centred" like everything else.
        var facts = Facts(new Vec3(4, 2, 2), origin: null, originInBounds: new Vec3(0.25, 0, 0.5));

        var box = SceneSpatial.Footprint(Node("counter", Vec3.Zero), facts.Values.Single());

        Assert.Equal(-1, box!.Value.Min.X, 6);
        Assert.Equal(3, box.Value.Max.X, 6);
        Assert.Equal(0, box.Value.Min.Y, 6);
    }

    [Fact]
    public void Footprint_When_The_Origin_Was_Never_Measured_Still_Falls_Back_To_The_Label()
    {
        // An asset derived before origins were measured keeps working off its label, so the
        // overlap and scale checks do not go dark on a library that has not been re-derived.
        var facts = Facts(new Vec3(2, 4, 2), origin: "bottom-center", originInBounds: null);

        Assert.Equal(0, SceneSpatial.Footprint(Node("lamp", Vec3.Zero), facts.Values.Single())!.Value.Min.Y, 6);
    }

    [Fact]
    public void FindOverlaps_When_Two_Nodes_Share_Volume_Returns_The_Pair()
    {
        var facts = Facts(new Vec3(2, 2, 2), "centered");
        var nodes = new[] { Node("a", Vec3.Zero), Node("b", new Vec3(1, 0, 0)) };

        var overlaps = SceneSpatial.FindOverlaps(nodes, facts);

        var overlap = Assert.Single(overlaps);
        Assert.Contains("a", new[] { overlap.NodeIdA, overlap.NodeIdB });
        Assert.Contains("b", new[] { overlap.NodeIdA, overlap.NodeIdB });
        Assert.True(overlap.IntersectionVolume > 0);
    }

    [Fact]
    public void FindOverlaps_When_Two_Nodes_Only_Touch_Returns_Nothing()
    {
        // Two walls flush against each other is how a room is built, not a mistake.
        var facts = Facts(new Vec3(2, 2, 2), "centered");
        var nodes = new[] { Node("a", Vec3.Zero), Node("b", new Vec3(2, 0, 0)) };

        Assert.Empty(SceneSpatial.FindOverlaps(nodes, facts));
    }

    [Fact]
    public void FindOverlaps_Skips_Hidden_Nodes()
    {
        var facts = Facts(new Vec3(2, 2, 2), "centered");
        var nodes = new[] { Node("a", Vec3.Zero), Node("b", Vec3.Zero) with { Visible = false } };

        Assert.Empty(SceneSpatial.FindOverlaps(nodes, facts));
    }

    [Fact]
    public void FindOverlaps_Calls_A_Thing_Sitting_On_Another_Resting_Rather_Than_A_Collision()
    {
        // A cushion on a sofa, a vase on a table. The AABB check finds them all correctly and
        // then cannot rank them, which is why "5 overlaps, all fine" used to read exactly
        // like "5 overlaps, all bugs".
        var table = Facts(new Vec3(2, 1, 2), "bottom-center");
        var vase = Facts(new Vec3(0.3, 0.4, 0.3), "bottom-center", assetId: 2);
        var facts = table.Concat(vase).ToDictionary(e => e.Key, e => e.Value, StringComparer.Ordinal);

        var nodes = new[]
        {
            Node("table", Vec3.Zero),
            // Sunk 5 cm into the table's top face - not perfect contact, because a pair that
            // only grazes is below the overlap tolerance and never reported at all.
            Node("vase", new Vec3(0, 0.95, 0), assetId: 2),
        };

        var overlap = Assert.Single(SceneSpatial.FindOverlaps(nodes, facts));

        Assert.Equal(SceneOverlapKinds.Resting, overlap.Kind);
        Assert.True(overlap.LikelyIntentional);
    }

    [Fact]
    public void FindOverlaps_Calls_A_Node_Buried_In_Another_Contained_And_Never_Intentional()
    {
        var big = Facts(new Vec3(4, 4, 4), "centered");
        var small = Facts(new Vec3(0.5, 0.5, 0.5), "centered", assetId: 2);
        var facts = big.Concat(small).ToDictionary(e => e.Key, e => e.Value, StringComparer.Ordinal);

        var nodes = new[] { Node("wall", Vec3.Zero), Node("lamp", Vec3.Zero, assetId: 2) };

        var overlap = Assert.Single(SceneSpatial.FindOverlaps(nodes, facts));

        Assert.Equal(SceneOverlapKinds.Contained, overlap.Kind);
        Assert.False(overlap.LikelyIntentional);
    }

    [Fact]
    public void FindOverlaps_Treats_A_Declared_Anchor_As_Resting_Even_When_The_Boxes_Say_Otherwise()
    {
        // The document saying "this rests on that" is the scene's own statement of intent,
        // and it outranks a box that a rotation made larger than the object inside it.
        var facts = Facts(new Vec3(2, 2, 2), "centered");
        var nodes = new[]
        {
            Node("table", Vec3.Zero),
            Node("book", new Vec3(0.9, 0.5, 0)) with { Anchor = new SceneAnchor("table", Vec3.Zero) },
        };

        var overlap = Assert.Single(SceneSpatial.FindOverlaps(nodes, facts));

        Assert.Equal(SceneOverlapKinds.Resting, overlap.Kind);
        Assert.True(overlap.LikelyIntentional);
    }

    [Fact]
    public void FindOverlaps_Reports_A_Real_Collision_Before_One_That_Is_Probably_Fine()
    {
        // Ordering is the payoff: the first entry an agent reads is the one worth acting on,
        // not whichever happens to share the most volume.
        var big = Facts(new Vec3(2, 2, 2), "centered");
        var small = Facts(new Vec3(0.4, 0.4, 0.4), "centered", assetId: 2);
        var facts = big.Concat(small).ToDictionary(e => e.Key, e => e.Value, StringComparer.Ordinal);

        var nodes = new[]
        {
            Node("armchair", Vec3.Zero),
            Node("sofa", new Vec3(1, 0, 0)),
            // Rests on the armchair's top face, sunk slightly: a wide shared slab, but a
            // thin one, and starting well above the armchair's own base.
            Node("cushion", new Vec3(0, 1.15, 0), assetId: 2),
        };

        var overlaps = SceneSpatial.FindOverlaps(nodes, facts);

        Assert.Equal(SceneOverlapKinds.Intersecting, overlaps[0].Kind);
        Assert.False(overlaps[0].LikelyIntentional);
        Assert.All(overlaps.Skip(1), o => Assert.True(o.LikelyIntentional));
    }

    [Fact]
    public void FindScaleWarnings_When_Source_Bounds_Are_Normalised_Warns()
    {
        // The base-meshes trap: normalised to ~2 m, so an apple and an apartment arrive the
        // same size and a scene built from them is uniformly wrong.
        var facts = Facts(new Vec3(2.0, 1.4, 0.9), "bottom-center");

        var warnings = SceneSpatial.FindScaleWarnings(new[] { Node("apple", Vec3.Zero) }, facts);

        Assert.Equal("NormalizedSourceBounds", Assert.Single(warnings).Code);
    }

    [Fact]
    public void FindScaleWarnings_When_An_Explicit_Scale_Is_Set_Does_Not_Warn_About_Normalisation()
    {
        var facts = Facts(new Vec3(2.0, 1.4, 0.9), "bottom-center");
        var node = Node("apple", Vec3.Zero, scale: new Vec3(0.04, 0.04, 0.04));

        Assert.DoesNotContain(
            SceneSpatial.FindScaleWarnings(new[] { node }, facts),
            w => w.Code == "NormalizedSourceBounds");
    }

    [Fact]
    public void FindScaleWarnings_When_One_Node_Dwarfs_The_Rest_Reports_It()
    {
        var facts = new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);
        foreach (var (assetId, size) in new[] { (1, 1.0), (2, 1.0), (3, 500.0) })
        {
            var reference = new SceneAssetRef(ModelType, assetId, 1);
            facts[SceneSpatial.FactsKey(reference)] =
                new(ModelType, assetId, 1, new Vec3(size, size, size), "centered");
        }

        var nodes = new[]
        {
            Node("small-a", Vec3.Zero, assetId: 1),
            Node("small-b", new Vec3(10, 0, 0), assetId: 2),
            Node("enormous", new Vec3(1000, 0, 0), assetId: 3),
        };

        var warnings = SceneSpatial.FindScaleWarnings(nodes, facts);

        Assert.Contains(warnings, w => w.Code == "ImplausibleRelativeScale" && w.NodeId == "enormous");
    }

    [Fact]
    public void SnapToGrid_Rounds_Onto_The_Grid()
    {
        var snapped = SceneSpatial.SnapToGrid(new Vec3(2.4, 0, -3.7), 1.0);

        Assert.Equal(2, snapped.X, 6);
        Assert.Equal(-4, snapped.Z, 6);
    }

    [Fact]
    public void SnapToGrid_When_Grid_Is_Not_Positive_Leaves_The_Position_Alone()
    {
        var position = new Vec3(2.4, 0, -3.7);

        Assert.Equal(position, SceneSpatial.SnapToGrid(position, 0));
    }

    [Fact]
    public void DistributeAlongLine_Spaces_Copies_Inclusively()
    {
        var positions = SceneSpatial.DistributeAlongLine(new Vec3(0, 0, 0), new Vec3(10, 0, 0), 3);

        Assert.Equal(3, positions.Count);
        Assert.Equal(0, positions[0].X, 6);
        Assert.Equal(5, positions[1].X, 6);
        Assert.Equal(10, positions[2].X, 6);
    }

    [Fact]
    public void DistributeAlongLine_When_Count_Is_One_Returns_The_Start()
    {
        Assert.Equal(new Vec3(1, 2, 3), Assert.Single(SceneSpatial.DistributeAlongLine(new Vec3(1, 2, 3), new Vec3(9, 9, 9), 1)));
    }
}
