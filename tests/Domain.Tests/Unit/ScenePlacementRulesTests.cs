using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// The placement rules a node carries with it: rest on the floor, rest on another node, face
/// a point. These are the rules that make a scene survive being edited - the run that
/// produced them lost four nodes into the floor to one move that did not restate a flag, and
/// had to recompute every stacked Y by hand when the furniture underneath was swapped.
///
/// Asserted against hand-computed geometry: every asset here is 0..1 in its own bounds with
/// its origin on the base, so the expected numbers are readable without running the code.
/// </summary>
public class ScenePlacementRulesTests
{
    private const string ModelType = SceneAssetTypes.Model;

    /// <summary>Origin on the bottom face, centred in X/Z - how most of the library is authored.</summary>
    private static readonly Vec3 BaseAtOrigin = new(0.5, 0, 0.5);

    private static SceneNode Node(
        string id,
        Vec3 position,
        int assetId = 1,
        bool? groundSnap = null,
        SceneAnchor? anchor = null,
        Vec3? faceToward = null,
        string? frontAxis = null,
        Vec3? rotation = null) =>
        new(
            id,
            new SceneTransform(position, rotation ?? Vec3.Zero, Vec3.One),
            Asset: new SceneAssetRef(ModelType, assetId, 1),
            GroundSnap: groundSnap,
            FrontAxis: frontAxis,
            FaceToward: faceToward,
            Anchor: anchor);

    private static Dictionary<string, SceneAssetFacts> Facts(params (int AssetId, Vec3 Dimensions)[] assets)
    {
        var facts = new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);
        foreach (var (assetId, dimensions) in assets)
        {
            var reference = new SceneAssetRef(ModelType, assetId, 1);
            facts[SceneSpatial.FactsKey(reference)] =
                new(ModelType, assetId, 1, dimensions, OriginInBounds: BaseAtOrigin);
        }

        return facts;
    }

    /// <summary>
    /// Per-axis comparison. A captured offset is a difference of two placed positions, so it
    /// carries the last bit of floating-point error from both - and the assertion is about
    /// where the vase is, not about the sixteenth decimal.
    /// </summary>
    private static void AssertVec3(Vec3 expected, Vec3? actual)
    {
        Assert.NotNull(actual);
        Assert.Equal(expected.X, actual!.Value.X, 6);
        Assert.Equal(expected.Y, actual.Value.Y, 6);
        Assert.Equal(expected.Z, actual.Value.Z, 6);
    }

    private static SceneDocument Document(params SceneNode[] nodes) =>
        new(SceneDocument.CurrentSchemaVersion, nodes, Array.Empty<SceneLight>());

    private static SceneNode Resolved(SceneDocument current, SceneDocument candidate, IReadOnlyDictionary<string, SceneAssetFacts> facts, string nodeId) =>
        SceneSpatial.ResolvePlacements(current, candidate, facts).Nodes.Single(n => n.Id == nodeId);

    // A 2 m wide, 1 m tall, 2 m deep table, and a small object to put on it.
    private static readonly (int, Vec3) Table = (1, new Vec3(2, 1, 2));
    private static readonly (int, Vec3) Vase = (2, new Vec3(0.2, 0.4, 0.2));

    [Theory]
    // +Z is the assumed front, so facing straight down +Z needs no turn at all.
    [InlineData(SceneFrontAxes.PlusZ, 0, 5, 0)]
    [InlineData(SceneFrontAxes.PlusZ, 5, 0, 90)]
    [InlineData(SceneFrontAxes.PlusZ, 0, -5, 180)]
    [InlineData(SceneFrontAxes.PlusZ, -5, 0, -90)]
    // An asset authored facing -Z needs half a turn more than one facing +Z.
    [InlineData(SceneFrontAxes.MinusZ, 0, 5, 180)]
    [InlineData(SceneFrontAxes.PlusX, 5, 0, 0)]
    [InlineData(SceneFrontAxes.MinusX, 5, 0, 180)]
    public void FacingYaw_Turns_The_Declared_Front_Towards_The_Target(string frontAxis, double x, double z, double expected)
    {
        var yaw = SceneSpatial.FacingYawDegrees(Vec3.Zero, new Vec3(x, 0, z), frontAxis);

        Assert.NotNull(yaw);
        Assert.Equal(expected, yaw!.Value, 6);
    }

    [Fact]
    public void FacingYaw_Ignores_Height_Because_Facing_Is_A_Turn_About_Y()
    {
        // A TV mounted above the sofa is still "in front of" it - tipping the sofa back to
        // look up at it is not what anybody asked for.
        var yaw = SceneSpatial.FacingYawDegrees(Vec3.Zero, new Vec3(0, 12, 5), SceneFrontAxes.PlusZ);

        Assert.Equal(0, yaw!.Value, 6);
    }

    [Fact]
    public void FacingYaw_When_The_Target_Is_Where_The_Node_Already_Stands_Has_No_Answer()
    {
        Assert.Null(SceneSpatial.FacingYawDegrees(new Vec3(3, 0, 3), new Vec3(3, 9, 3), SceneFrontAxes.PlusZ));
    }

    [Fact]
    public void GroundSnap_Stays_Applied_When_A_Later_Write_Moves_The_Node_Sideways()
    {
        // The bug this rule exists for: a move that supplies a position without restating
        // groundSnap used to re-centre the node on its origin and half-bury it.
        var facts = Facts(Table);
        var stored = Document(Node("table", new Vec3(0, 0, 0), groundSnap: true));
        var moved = Document(Node("table", new Vec3(4, -3, 2), groundSnap: true));

        var node = Resolved(stored, moved, facts, "table");

        Assert.Equal(0, node.Transform.Position.Y, 6);
        Assert.Equal(4, node.Transform.Position.X, 6);
    }

    [Fact]
    public void A_Node_That_Never_Asked_To_Be_Grounded_Is_Left_Where_It_Is()
    {
        var facts = Facts(Table);
        var stored = Document(Node("table", Vec3.Zero));
        var moved = Document(Node("table", new Vec3(0, 7, 0)));

        Assert.Equal(7, Resolved(stored, moved, facts, "table").Transform.Position.Y, 6);
    }

    [Fact]
    public void Anchoring_Centred_Rests_The_Node_On_The_Middle_Of_The_Top_Face()
    {
        var facts = Facts(Table, Vase);
        var table = Node("table", new Vec3(5, 0, 3), assetId: 1);
        var stored = Document(table);
        var candidate = Document(
            table,
            Node("vase", Vec3.Zero, assetId: 2, anchor: new SceneAnchor("table", Vec3.Zero)));

        var vase = Resolved(stored, candidate, facts, "vase");

        // The table's top face is at y=1, centred on (5, 3).
        Assert.Equal(new Vec3(5, 1, 3), vase.Transform.Position);
    }

    [Fact]
    public void Anchoring_Without_An_Offset_Keeps_The_Node_Over_Its_Own_Spot_And_Rests_It_On_Top()
    {
        var facts = Facts(Table, Vase);
        var table = Node("table", new Vec3(5, 0, 3));
        var stored = Document(table);
        var candidate = Document(
            table,
            // Sitting on the floor near the table's edge, then attached with no offset.
            Node("vase", new Vec3(5.6, 0, 3), assetId: 2, anchor: new SceneAnchor("table")));

        var vase = Resolved(stored, candidate, facts, "vase");

        Assert.Equal(new Vec3(5.6, 1, 3), vase.Transform.Position);
        // The captured offset is horizontal: attaching something standing on the floor must
        // not record "one metre below the table top" as where it belongs.
        AssertVec3(new Vec3(0.6, 0, 0), vase.Anchor!.Offset);
    }

    [Fact]
    public void Moving_The_Anchor_Carries_Everything_Resting_On_It()
    {
        // The repetitive thing this removes: when the furniture underneath was swapped, every
        // stacked Y had to be recomputed and re-issued by hand.
        var facts = Facts(Table, Vase);
        var stored = Document(
            Node("table", new Vec3(5, 0, 3)),
            Node("vase", new Vec3(5, 1, 3), assetId: 2, anchor: new SceneAnchor("table", new Vec3(0.5, 0, 0))));

        var candidate = Document(
            Node("table", new Vec3(-2, 0, 8)),
            stored.Nodes[1]);

        var vase = Resolved(stored, candidate, facts, "vase");

        Assert.Equal(new Vec3(-1.5, 1, 8), vase.Transform.Position);
    }

    [Fact]
    public void Repositioning_A_Node_On_Its_Anchor_Records_Where_It_Was_Put_Rather_Than_Snapping_It_Back()
    {
        // Arranging two things on one table is the ordinary case - they cannot both be
        // centred, and the second nudge must not be undone by the rule that keeps them there.
        var facts = Facts(Table, Vase);
        var table = Node("table", new Vec3(5, 0, 3));
        var anchor = new SceneAnchor("table", Vec3.Zero);
        var stored = Document(table, Node("vase", new Vec3(5, 1, 3), assetId: 2, anchor: anchor));
        var candidate = Document(table, Node("vase", new Vec3(5.4, 1, 3.2), assetId: 2, anchor: anchor));

        var vase = Resolved(stored, candidate, facts, "vase");

        Assert.Equal(new Vec3(5.4, 1, 3.2), vase.Transform.Position);
        AssertVec3(new Vec3(0.4, 0, 0.2), vase.Anchor!.Offset);
    }

    [Fact]
    public void A_Chain_Of_Anchors_Settles_From_The_Bottom_Up()
    {
        var facts = Facts(Table, Vase, (3, new Vec3(0.5, 0.1, 0.5)));
        var stored = Document(Node("table", Vec3.Zero));
        var candidate = Document(
            Node("table", new Vec3(0, 0, 0)),
            // Deliberately out of order in the array: a tray listed after the book that rests
            // on it must still settle first.
            Node("book", Vec3.Zero, assetId: 2, anchor: new SceneAnchor("tray", Vec3.Zero)),
            Node("tray", Vec3.Zero, assetId: 3, anchor: new SceneAnchor("table", Vec3.Zero)));

        var resolved = SceneSpatial.ResolvePlacements(stored, candidate, facts);

        Assert.Equal(1, resolved.Nodes.Single(n => n.Id == "tray").Transform.Position.Y, 6);
        Assert.Equal(1.1, resolved.Nodes.Single(n => n.Id == "book").Transform.Position.Y, 6);
    }

    [Fact]
    public void An_Anchor_Onto_Something_Without_Bounds_Leaves_The_Node_Exactly_Where_It_Is()
    {
        // No bounds means no top face to rest on. Inventing a height would be a placement
        // nobody asked for, reported as a success.
        var facts = Facts(Vase);
        var stored = Document(Node("shelf", new Vec3(0, 2, 0)));
        var candidate = Document(
            Node("shelf", new Vec3(0, 2, 0)),
            Node("vase", new Vec3(9, 9, 9), assetId: 2, anchor: new SceneAnchor("shelf", Vec3.Zero)));

        Assert.Equal(new Vec3(9, 9, 9), Resolved(stored, candidate, facts, "vase").Transform.Position);
    }

    [Fact]
    public void An_Anchor_Onto_A_Node_That_Is_Not_There_Leaves_The_Node_Alone_Rather_Than_Dropping_It()
    {
        var facts = Facts(Vase);
        var candidate = Document(
            Node("vase", new Vec3(1, 5, 2), assetId: 2, groundSnap: true, anchor: new SceneAnchor("ghost", Vec3.Zero)));

        Assert.Equal(new Vec3(1, 5, 2), Resolved(Document(), candidate, facts, "vase").Transform.Position);
    }

    [Fact]
    public void Facing_Is_Measured_From_Where_The_Node_Ends_Up_Not_From_Where_It_Was_Passed_In()
    {
        // "Put the TV on the console facing the sofa" arrives as one call, and the position it
        // carries is whatever the caller happened to pass - usually the origin.
        var facts = Facts(Table, Vase);
        var console = Node("console", new Vec3(0, 0, -4));
        var stored = Document(console);
        var candidate = Document(
            console,
            Node("tv", Vec3.Zero, assetId: 2, anchor: new SceneAnchor("console", Vec3.Zero), faceToward: new Vec3(0, 0, 0)));

        var tv = Resolved(stored, candidate, facts, "tv");

        // Seated at z = -4 and facing the origin, so it looks along +Z: no turn.
        Assert.Equal(0, tv.Transform.RotationEuler.Y, 6);
        Assert.Equal(new Vec3(0, 1, -4), tv.Transform.Position);
    }

    [Fact]
    public void A_Facing_Node_Re_Aims_When_What_It_Faces_Moves()
    {
        var facts = Facts(Table, Vase);
        var stored = Document(
            Node("tv", new Vec3(0, 0, 0)),
            Node("sofa", new Vec3(0, 0, -5), assetId: 2, faceToward: Vec3.Zero));

        var candidate = Document(Node("tv", new Vec3(5, 0, 0)), stored.Nodes[1]);

        // The sofa did not move; the thing it faces did, and it turns to keep facing it.
        var sofa = Resolved(stored, candidate, facts, "sofa");

        Assert.Equal(0, sofa.Transform.RotationEuler.Y, 6);
        var reAimed = Resolved(
            stored,
            Document(candidate.Nodes[0], Node("sofa", new Vec3(0, 0, -5), assetId: 2, faceToward: new Vec3(5, 0, 0))),
            facts,
            "sofa");
        Assert.Equal(45, reAimed.Transform.RotationEuler.Y, 6);
    }

    [Fact]
    public void A_Cycle_Of_Anchors_Terminates_And_Is_Left_For_The_Validator_To_Reject()
    {
        var facts = Facts(Table, Vase);
        var candidate = Document(
            Node("a", Vec3.Zero, anchor: new SceneAnchor("b", Vec3.Zero)),
            Node("b", Vec3.Zero, assetId: 2, anchor: new SceneAnchor("a", Vec3.Zero)));

        var resolved = SceneSpatial.ResolvePlacements(Document(), candidate, facts);

        Assert.Equal(2, resolved.Nodes.Count);
        Assert.NotEmpty(SceneDocumentValidator.Validate(resolved));
        Assert.Contains(SceneDocumentValidator.Validate(resolved), i => i.Code == "AnchorCycle");
    }
}
