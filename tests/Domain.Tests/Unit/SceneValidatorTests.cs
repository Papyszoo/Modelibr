using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// The checks that were supposed to catch a visibly broken scene and did not exist yet.
///
/// Each test here is one of the mistakes from the living-room run that every existing check
/// passed: furniture floating, a sample scene placed as a rug, a wall under the floor, a room
/// lit only by ambient. Asserted on the finding codes, because those are what a caller
/// branches on and renaming one is a contract change.
/// </summary>
public class SceneValidatorTests
{
    private const string ModelType = SceneAssetTypes.Model;

    /// <summary>The origin on the bottom face, centred in X/Z - how most of the library is authored.</summary>
    private static readonly Vec3 BaseAtOrigin = new(0.5, 0, 0.5);

    private static SceneNode Node(
        string id,
        Vec3 position,
        int assetId = 1,
        Vec3? rotation = null,
        bool? groundSnap = null,
        SceneAnchor? anchor = null,
        bool visible = true,
        SceneMaterialBinding? material = null,
        IReadOnlyList<SceneMaterialBinding>? materialSlots = null) =>
        new(
            id,
            new SceneTransform(position, rotation ?? Vec3.Zero, Vec3.One),
            Asset: new SceneAssetRef(ModelType, assetId, 1),
            Visible: visible,
            GroundSnap: groundSnap,
            Anchor: anchor,
            Material: material,
            MaterialSlots: materialSlots);

    private static Dictionary<string, SceneAssetFacts> Facts(params (int AssetId, Vec3 Dimensions)[] assets)
    {
        var facts = new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);
        foreach (var (assetId, dimensions) in assets)
        {
            var reference = new SceneAssetRef(ModelType, assetId, 1);
            facts[SceneSpatial.FactsKey(reference)] =
                new SceneAssetFacts(ModelType, assetId, 1, dimensions, OriginInBounds: BaseAtOrigin);
        }

        return facts;
    }

    private static Dictionary<string, SceneAssetProfile> Profiles(params SceneAssetProfile[] profiles)
    {
        var byKey = new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal);
        foreach (var profile in profiles)
        {
            var reference = new SceneAssetRef(profile.AssetType, profile.AssetId, profile.VersionId);
            byKey[SceneSpatial.FactsKey(reference)] = profile;
        }

        return byKey;
    }

    /// <summary>A model whose material makes it render as something, so appearance stays quiet.</summary>
    private static SceneAssetProfile Textured(int assetId) =>
        new(ModelType, assetId, 1, PartCount: 1, MaterialCount: 1);

    private static SceneDocument Document(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyList<SceneLight>? lights = null,
        SceneEnvironment? environment = null) =>
        new(
            SceneDocument.CurrentSchemaVersion,
            nodes,
            lights ?? new[] { new SceneLight("key", SceneLightTypes.Directional, new Vec3(0, 5, 0)) },
            environment);

    private static IReadOnlyList<string> Codes(SceneValidationReport report) =>
        report.Findings.Select(f => f.Code).ToList();

    [Fact]
    public void A_Clean_Scene_Has_No_Findings()
    {
        var document = Document(new[] { Node("sofa", Vec3.Zero, groundSnap: true) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(2.2, 0.85, 0.95))), Profiles(Textured(1)));

        Assert.Equal(SceneVerdicts.Ok, report.Verdict);
        Assert.Empty(report.Findings);
    }

    [Fact]
    public void A_Node_Floating_Over_Nothing_Is_Reported()
    {
        var document = Document(new[] { Node("lamp", new Vec3(0, 0.4, 0)) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(0.3, 1.5, 0.3))), Profiles(Textured(1)));

        var finding = Assert.Single(report.Findings);
        Assert.Equal("Contact.Unsupported", finding.Code);
        Assert.Equal(SceneFindingSeverities.Warning, finding.Severity);
        Assert.Equal(SceneVerdicts.Warnings, report.Verdict);
    }

    [Fact]
    public void A_Node_Resting_On_Another_Node_Is_Not_Reported_As_Floating()
    {
        // A 0.7 m table with a vase standing on its top face - the ordinary stacked case.
        var document = Document(new[]
        {
            Node("table", Vec3.Zero, groundSnap: true),
            Node("vase", new Vec3(0, 0.7, 0), assetId: 2),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(1.2, 0.7, 0.8)), (2, new Vec3(0.2, 0.3, 0.2))),
            Profiles(Textured(1), Textured(2)));

        Assert.Empty(report.Findings);
    }

    [Fact]
    public void An_Anchored_Node_Whose_Base_Left_Its_Surface_Is_An_Error()
    {
        // The anchor says "on the table"; the transform puts it 0.3 m above the table's top.
        var document = Document(new[]
        {
            Node("table", Vec3.Zero, groundSnap: true),
            Node("vase", new Vec3(0, 1.0, 0), assetId: 2, anchor: new SceneAnchor("table", Vec3.Zero)),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(1.2, 0.7, 0.8)), (2, new Vec3(0.2, 0.3, 0.2))),
            Profiles(Textured(1), Textured(2)));

        var finding = Assert.Single(report.Findings);
        Assert.Equal("Contact.AnchorFloating", finding.Code);
        Assert.Equal(SceneFindingSeverities.Error, finding.Severity);
        Assert.Equal(SceneVerdicts.Errors, report.Verdict);
    }

    [Fact]
    public void An_Anchor_Pointing_At_A_Node_That_Is_Not_There_Is_An_Error()
    {
        var document = Document(new[]
        {
            Node("vase", new Vec3(0, 0.7, 0), anchor: new SceneAnchor("table", Vec3.Zero)),
        });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(0.2, 0.3, 0.2))), Profiles(Textured(1)));

        Assert.Contains("Contact.AnchorMissing", Codes(report));
    }

    [Fact]
    public void A_Ground_Snapped_Node_That_Is_Not_On_The_Ground_Is_An_Error()
    {
        // What a document written before the placement rules, or edited by hand, looks like.
        var document = Document(new[] { Node("sofa", new Vec3(0, 0.39, 0), groundSnap: true) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(2, 0.8, 1))), Profiles(Textured(1)));

        Assert.Contains("Contact.GroundSnapFloating", Codes(report));
    }

    [Fact]
    public void Geometry_Below_The_Floor_Is_Reported()
    {
        var document = Document(new[] { Node("wall", new Vec3(0, -0.5, 0)) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(4, 2.5, 0.2))), Profiles(Textured(1)));

        Assert.Contains("Containment.BelowFloor", Codes(report));
    }

    [Fact]
    public void A_Primitive_Floor_Slab_Ending_At_The_Floor_Plane_Is_Not_Reported_As_Below_It()
    {
        var floor = new SceneNode(
            "room-floor",
            new SceneTransform(new Vec3(0, -0.05, 0), Vec3.Zero, Vec3.One),
            Primitive: new ScenePrimitive(ScenePrimitiveShapes.Box, new Vec3(5.2, 0.1, 4.2)),
            Name: "Room floor");
        var document = Document(new[] { floor });

        var report = SceneValidator.Validate(
            document,
            new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal),
            new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal));

        Assert.DoesNotContain("Containment.BelowFloor", Codes(report));
    }

    [Fact]
    public void A_Vertical_Primitive_Ending_At_The_Floor_Plane_Is_Still_Reported()
    {
        var wall = new SceneNode(
            "sunken-wall",
            new SceneTransform(new Vec3(0, -1.25, 0), Vec3.Zero, Vec3.One),
            Primitive: new ScenePrimitive(ScenePrimitiveShapes.Box, new Vec3(4, 2.5, 0.2)));
        var document = Document(new[] { wall });

        var report = SceneValidator.Validate(
            document,
            new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal),
            new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal));

        Assert.Contains("Containment.BelowFloor", Codes(report));
    }

    [Fact]
    public void A_Node_At_A_Stray_Coordinate_Is_Reported()
    {
        var document = Document(new[]
        {
            Node("sofa", Vec3.Zero, groundSnap: true),
            Node("table", new Vec3(2, 0, 0), assetId: 2, groundSnap: true),
            Node("lamp", new Vec3(1000, 0, 0), assetId: 3, groundSnap: true),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95)), (2, new Vec3(1, 0.7, 1)), (3, new Vec3(0.3, 1.5, 0.3))),
            Profiles(Textured(1), Textured(2), Textured(3)));

        var finding = Assert.Single(report.Findings, f => f.Code == "Containment.FarFromScene");
        Assert.Equal(new[] { "lamp" }, finding.NodeIds);
    }

    [Fact]
    public void An_Asset_Carrying_Cameras_And_Lights_Is_Reported_As_A_Sample_Scene()
    {
        // PlaysetLightTest, placed as a rug because a search hit named one part of it.
        var document = Document(new[] { Node("rug", Vec3.Zero, groundSnap: true) });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.01, 2.2))),
            Profiles(new SceneAssetProfile(
                ModelType, 1, 1,
                PartCount: 12,
                CameraParts: new[] { "/scene/camera" },
                LightParts: new[] { "/scene/light_a", "/scene/light_b" },
                MaterialCount: 4)));

        var finding = Assert.Single(report.Findings, f => f.Code == "Identity.ContainsNonGeometry");
        Assert.Contains("/scene/camera", finding.Message);
    }

    [Fact]
    public void An_Asset_With_No_Mesh_Is_An_Error()
    {
        var document = Document(new[] { Node("prop", Vec3.Zero, groundSnap: true) });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(1, 1, 1))),
            Profiles(new SceneAssetProfile(
                ModelType, 1, 1, PartCount: 3, MaterialCount: 1, QualityFlags: new[] { "no_geometry" })));

        Assert.Contains("Identity.NoGeometry", Codes(report));
        Assert.Equal(SceneVerdicts.Errors, report.Verdict);
    }

    [Theory]
    [InlineData(12.0, "Orientation.Tilted")]
    [InlineData(90.0, "Orientation.OnItsSide")]
    [InlineData(180.0, "Orientation.UpsideDown")]
    public void Rotation_Off_The_Vertical_Is_Reported(double rotationX, string expectedCode)
    {
        var document = Document(new[] { Node("panel", Vec3.Zero, rotation: new Vec3(rotationX, 0, 0)) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(2, 2.5, 0.2))), Profiles(Textured(1)));

        Assert.Contains(expectedCode, Codes(report));
    }

    [Fact]
    public void Turning_A_Node_About_Y_Is_Composition_And_Is_Not_Reported()
    {
        // Yaw is how everything faces the TV. Reporting it would make the check unreadable.
        var document = Document(new[] { Node("armchair", Vec3.Zero, rotation: new Vec3(0, 37, 0), groundSnap: true) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(1, 1, 1))), Profiles(Textured(1)));

        Assert.DoesNotContain(Codes(report), c => c.StartsWith("Orientation.", StringComparison.Ordinal));
    }

    [Fact]
    public void A_Scene_With_No_Lights_Is_Reported()
    {
        var document = Document(new[] { Node("sofa", Vec3.Zero, groundSnap: true) }, lights: Array.Empty<SceneLight>());

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(2.2, 0.85, 0.95))), Profiles(Textured(1)));

        Assert.Contains("Appearance.Unlit", Codes(report));
    }

    [Fact]
    public void A_Scene_Lit_Only_By_Ambient_Is_Reported()
    {
        var document = Document(
            new[] { Node("sofa", Vec3.Zero, groundSnap: true) },
            lights: new[] { new SceneLight("fill", SceneLightTypes.Ambient, Vec3.Zero) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(2.2, 0.85, 0.95))), Profiles(Textured(1)));

        var finding = Assert.Single(report.Findings, f => f.Code == "Appearance.AmbientOnly");
        Assert.Equal(SceneFindingSeverities.Warning, finding.Severity);
    }

    [Fact]
    public void An_Environment_Map_Makes_The_Missing_Key_Light_A_Note_Rather_Than_A_Warning()
    {
        var document = Document(
            new[] { Node("sofa", Vec3.Zero, groundSnap: true) },
            lights: Array.Empty<SceneLight>(),
            environment: new SceneEnvironment(new SceneAssetRef(SceneAssetTypes.EnvironmentMap, 7)));

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(2.2, 0.85, 0.95))), Profiles(Textured(1)));

        var finding = Assert.Single(report.Findings, f => f.Code == "Appearance.Unlit");
        Assert.Equal(SceneFindingSeverities.Info, finding.Severity);
        Assert.Equal(SceneVerdicts.Ok, report.Verdict);
    }

    [Fact]
    public void An_Asset_With_No_Material_Is_Reported_As_Grey()
    {
        var document = Document(new[] { Node("sofa", Vec3.Zero, groundSnap: true) });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95))),
            Profiles(new SceneAssetProfile(ModelType, 1, 1, PartCount: 1, MaterialCount: 0)));

        Assert.Contains("Appearance.NoMaterial", Codes(report));
    }

    [Fact]
    public void A_Parameter_Material_Dresses_A_Node_That_Declares_No_Material_Of_Its_Own()
    {
        // The binding that needs no texture set at all. Reading only node.Material's
        // TextureSetId called this node bare and reported it as rendering grey - against a
        // node an agent had dressed correctly, and on every subsequent validate call.
        var document = Document(new[]
        {
            Node("sofa", Vec3.Zero, groundSnap: true, material: new SceneMaterialBinding(MaterialId: 4)),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95))),
            Profiles(new SceneAssetProfile(ModelType, 1, 1, PartCount: 1, MaterialCount: 0)));

        Assert.DoesNotContain("Appearance.NoMaterial", Codes(report));
    }

    [Fact]
    public void Per_Slot_Dressing_Counts_As_Having_A_Material()
    {
        var document = Document(new[]
        {
            Node(
                "sofa", Vec3.Zero, groundSnap: true,
                materialSlots: new[] { new SceneMaterialBinding(MaterialId: 4, Slot: "cushions") }),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95))),
            Profiles(new SceneAssetProfile(ModelType, 1, 1, PartCount: 1, MaterialCount: 0)));

        Assert.DoesNotContain("Appearance.NoMaterial", Codes(report));
    }

    [Fact]
    public void A_Texture_Set_Bound_To_A_Model_Without_Uvs_Is_A_Warning_Not_A_Silence()
    {
        // The case that actually renders wrong. The old test suppressed the finding as soon
        // as anything was bound, so it was quiet in exactly the situation it exists for.
        var document = Document(new[]
        {
            Node("sofa", Vec3.Zero, groundSnap: true, material: new SceneMaterialBinding(TextureSetId: 3)),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95))),
            Profiles(new SceneAssetProfile(
                ModelType, 1, 1, PartCount: 1, MaterialCount: 1,
                QualityFlags: new[] { "missing_uvs" })));

        var finding = Assert.Single(report.Findings, f => f.Code == "Appearance.MissingUvs");
        Assert.Equal(SceneFindingSeverities.Warning, finding.Severity);
    }

    [Fact]
    public void A_Parameter_Material_On_A_Model_Without_Uvs_Has_Nothing_To_Report()
    {
        // A colour and a roughness need no unwrap, which is why apply_material recommends
        // them for assets like this one. Warning here would train the caller to ignore it.
        var document = Document(new[]
        {
            Node("sofa", Vec3.Zero, groundSnap: true, material: new SceneMaterialBinding(MaterialId: 4)),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95))),
            Profiles(new SceneAssetProfile(
                ModelType, 1, 1, PartCount: 1, MaterialCount: 1,
                QualityFlags: new[] { "missing_uvs" })));

        Assert.DoesNotContain("Appearance.MissingUvs", Codes(report));
    }

    [Fact]
    public void An_Undressed_Model_Without_Uvs_Is_Noted_Before_Anything_Is_Bound()
    {
        var document = Document(new[] { Node("sofa", Vec3.Zero, groundSnap: true) });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95))),
            Profiles(new SceneAssetProfile(
                ModelType, 1, 1, PartCount: 1, MaterialCount: 1,
                QualityFlags: new[] { "missing_uvs" })));

        var finding = Assert.Single(report.Findings, f => f.Code == "Appearance.MissingUvs");
        Assert.Equal(SceneFindingSeverities.Info, finding.Severity);
    }

    [Fact]
    public void Nodes_Mostly_Inside_Each_Other_Are_Reported_Separately_From_Touching()
    {
        var document = Document(new[]
        {
            Node("sofa", Vec3.Zero, groundSnap: true),
            Node("cushion", Vec3.Zero, assetId: 2, groundSnap: true),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2.2, 0.85, 0.95)), (2, new Vec3(0.4, 0.2, 0.4))),
            Profiles(Textured(1), Textured(2)));

        Assert.Contains("Overlap.Interpenetrating", Codes(report));
    }

    [Fact]
    public void Nodes_That_Only_Touch_Are_Not_Reported_As_Interpenetrating()
    {
        // Two walls flush against each other - the normal way to build a room.
        var document = Document(new[]
        {
            Node("wall-a", Vec3.Zero, groundSnap: true),
            Node("wall-b", new Vec3(2, 0, 0), assetId: 2, groundSnap: true),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(2, 2.5, 0.2)), (2, new Vec3(2, 2.5, 0.2))),
            Profiles(Textured(1), Textured(2)));

        Assert.DoesNotContain("Overlap.Interpenetrating", Codes(report));
    }

    [Fact]
    public void A_Node_Without_Derived_Bounds_Is_Named_As_A_Blind_Spot_Rather_Than_Passed()
    {
        var document = Document(new[]
        {
            Node("sofa", Vec3.Zero, groundSnap: true),
            Node("mystery", new Vec3(5, 3, 0), assetId: 99),
        });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(2.2, 0.85, 0.95))), Profiles(Textured(1)));

        Assert.Equal(2, report.Coverage.NodeCount);
        Assert.Equal(1, report.Coverage.NodesWithBounds);
        Assert.Equal(new[] { "mystery" }, report.Coverage.NodesWithoutBounds);
        Assert.Contains(report.Coverage.Limitations, l => l.Contains("no derived bounds", StringComparison.Ordinal));
    }

    [Fact]
    public void The_Blind_Spot_That_Shipped_The_Wrong_Wall_Is_Always_Stated()
    {
        var document = Document(new[] { Node("wall", Vec3.Zero, groundSnap: true) });

        var report = SceneValidator.Validate(document, Facts((1, new Vec3(4, 2.5, 0.2))), Profiles(Textured(1)));

        Assert.Contains(report.Coverage.Limitations, l => l.Contains("axis-aligned", StringComparison.Ordinal));
    }

    [Fact]
    public void A_Hidden_Node_Neither_Holds_Anything_Up_Nor_Is_Checked_For_Contact()
    {
        var document = Document(new[]
        {
            Node("hidden-plinth", Vec3.Zero, groundSnap: true, visible: false),
            Node("vase", new Vec3(0, 1, 0), assetId: 2),
        });

        var report = SceneValidator.Validate(
            document,
            Facts((1, new Vec3(1, 1, 1)), (2, new Vec3(0.2, 0.3, 0.2))),
            Profiles(Textured(1), Textured(2)));

        var finding = Assert.Single(report.Findings, f => f.Code == "Contact.Unsupported");
        Assert.Equal(new[] { "vase" }, finding.NodeIds);
    }
}
