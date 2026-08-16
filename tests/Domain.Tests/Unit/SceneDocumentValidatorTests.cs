using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// The rejection rules. What matters here is that each of these is caught <i>before</i> a
/// document is stored - the feature this replaces accepted anything that was syntactically
/// JSON and fell back to an empty scene when it was not.
/// </summary>
public class SceneDocumentValidatorTests
{
    private static SceneNode ModelNode(string id, int assetId = 1, int? versionId = 7) =>
        new(id, SceneTransform.Identity, Asset: new SceneAssetRef(SceneAssetTypes.Model, assetId, versionId));

    private static SceneDocument DocumentWith(params SceneNode[] nodes) =>
        new(SceneDocument.CurrentSchemaVersion, nodes, Array.Empty<SceneLight>(), SceneEnvironment.Default);

    [Fact]
    public void Validate_When_Document_Is_Empty_Returns_No_Issues()
    {
        Assert.Empty(SceneDocumentValidator.Validate(SceneDocument.Empty()));
    }

    [Fact]
    public void Validate_When_Document_Is_Null_Returns_DocumentMissing()
    {
        var issues = SceneDocumentValidator.Validate(null);

        Assert.Equal("DocumentMissing", Assert.Single(issues).Code);
    }

    [Fact]
    public void Validate_When_Schema_Version_Is_Unsupported_Returns_Only_That_Issue()
    {
        // A document written for another version must not be judged by this version's rules;
        // reporting invented problems alongside the real one sends the caller chasing them.
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion + 1,
            new[] { ModelNode("", versionId: null) },
            Array.Empty<SceneLight>());

        var issues = SceneDocumentValidator.Validate(document);

        Assert.Equal("UnsupportedSchemaVersion", Assert.Single(issues).Code);
    }

    [Fact]
    public void Validate_When_A_Model_Node_Has_No_Version_Returns_VersionRequired()
    {
        var issues = SceneDocumentValidator.Validate(DocumentWith(ModelNode("lamp", versionId: null)));

        Assert.Contains(issues, i => i.Code == "VersionRequired" && i.Path == "nodes[0].asset.versionId");
    }

    [Fact]
    public void Validate_When_A_Non_Versioned_Family_Pins_A_Version_Returns_VersionNotApplicable()
    {
        var node = new SceneNode(
            "sprite", SceneTransform.Identity, Asset: new SceneAssetRef(SceneAssetTypes.Sprite, 3, VersionId: 2));

        var issues = SceneDocumentValidator.Validate(DocumentWith(node));

        Assert.Contains(issues, i => i.Code == "VersionNotApplicable");
    }

    [Fact]
    public void Validate_When_Two_Nodes_Share_An_Id_Returns_DuplicateNodeId()
    {
        var issues = SceneDocumentValidator.Validate(DocumentWith(ModelNode("lamp"), ModelNode("lamp", assetId: 2)));

        Assert.Contains(issues, i => i.Code == "DuplicateNodeId");
    }

    [Fact]
    public void Validate_When_A_Node_Has_Both_An_Asset_And_A_Primitive_Returns_NodeContentAmbiguous()
    {
        var node = new SceneNode(
            "both",
            SceneTransform.Identity,
            Asset: new SceneAssetRef(SceneAssetTypes.Model, 1, 1),
            Primitive: new ScenePrimitive(ScenePrimitiveShapes.Box));

        var issues = SceneDocumentValidator.Validate(DocumentWith(node));

        Assert.Contains(issues, i => i.Code == "NodeContentAmbiguous");
    }

    [Fact]
    public void Validate_When_A_Node_Has_Neither_An_Asset_Nor_A_Primitive_Returns_NodeContentAmbiguous()
    {
        var issues = SceneDocumentValidator.Validate(DocumentWith(new SceneNode("empty", SceneTransform.Identity)));

        Assert.Contains(issues, i => i.Code == "NodeContentAmbiguous");
    }

    [Fact]
    public void Validate_When_Scale_Is_Zero_Returns_DegenerateScale()
    {
        // The realistic way this arrives is an omitted "scale" deserialising to (0,0,0),
        // which reads as an invisible node rather than as the mistake it is.
        var node = ModelNode("lamp") with
        {
            Transform = new SceneTransform(Vec3.Zero, Vec3.Zero, Vec3.Zero),
        };

        var issues = SceneDocumentValidator.Validate(DocumentWith(node));

        Assert.Contains(issues, i => i.Code == "DegenerateScale");
    }

    [Fact]
    public void Validate_When_A_Coordinate_Is_Not_Finite_Returns_NonFiniteNumber()
    {
        var node = ModelNode("lamp") with
        {
            Transform = new SceneTransform(new Vec3(double.NaN, 0, 0), Vec3.Zero, Vec3.One),
        };

        var issues = SceneDocumentValidator.Validate(DocumentWith(node));

        Assert.Contains(issues, i => i.Code == "NonFiniteNumber");
    }

    [Fact]
    public void Validate_When_An_Unplaceable_Family_Is_Referenced_Returns_UnplaceableAssetType()
    {
        var node = new SceneNode("hum", SceneTransform.Identity, Asset: new SceneAssetRef("Sound", 4));

        var issues = SceneDocumentValidator.Validate(DocumentWith(node));

        Assert.Contains(issues, i => i.Code == "UnplaceableAssetType");
    }

    [Fact]
    public void Validate_When_An_Id_Contains_Unsupported_Characters_Returns_IdCharactersInvalid()
    {
        var issues = SceneDocumentValidator.Validate(DocumentWith(ModelNode("lamp post")));

        Assert.Contains(issues, i => i.Code == "IdCharactersInvalid");
    }

    [Fact]
    public void Validate_When_A_Light_Type_Is_Unknown_Returns_UnknownLightType()
    {
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            Array.Empty<SceneNode>(),
            new[] { new SceneLight("key", "laser", Vec3.Zero) });

        var issues = SceneDocumentValidator.Validate(document);

        Assert.Contains(issues, i => i.Code == "UnknownLightType");
    }

    [Fact]
    public void Validate_When_A_Light_Colour_Is_Not_Hex_Returns_InvalidColor()
    {
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            Array.Empty<SceneNode>(),
            new[] { new SceneLight("key", SceneLightTypes.Point, Vec3.Zero, Color: "warm white") });

        var issues = SceneDocumentValidator.Validate(document);

        Assert.Contains(issues, i => i.Code == "InvalidColor");
    }

    [Fact]
    public void Validate_Reports_Every_Problem_At_Once()
    {
        // An agent that has to re-submit once per problem burns a turn per typo.
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[] { ModelNode("lamp", versionId: null), ModelNode("lamp", assetId: 2, versionId: null) },
            new[] { new SceneLight("key", "laser", Vec3.Zero) });

        var issues = SceneDocumentValidator.Validate(document);

        Assert.Contains(issues, i => i.Code == "VersionRequired");
        Assert.Contains(issues, i => i.Code == "DuplicateNodeId");
        Assert.Contains(issues, i => i.Code == "UnknownLightType");
    }

    [Fact]
    public void Validate_When_An_Anchor_Names_A_Node_That_Is_Not_Here_Returns_AnchorNodeNotFound()
    {
        var node = ModelNode("vase") with { Anchor = new SceneAnchor("table") };

        var issues = SceneDocumentValidator.Validate(DocumentWith(node));

        Assert.Contains(issues, i => i.Code == "AnchorNodeNotFound" && i.Path == "nodes[0].anchor.onNodeId");
    }

    [Fact]
    public void Validate_When_A_Node_Rests_On_Itself_Returns_SelfAnchor()
    {
        var node = ModelNode("vase") with { Anchor = new SceneAnchor("vase") };

        var issues = SceneDocumentValidator.Validate(DocumentWith(node));

        Assert.Contains(issues, i => i.Code == "SelfAnchor");
        // Reported once, in the vocabulary of the mistake that was made.
        Assert.DoesNotContain(issues, i => i.Code == "AnchorCycle");
    }

    [Fact]
    public void Validate_When_Anchors_Form_A_Cycle_Returns_AnchorCycle()
    {
        // Nodes resting on each other have no resolvable height. Breaking the cycle by
        // picking a winner would place both somewhere neither caller asked for.
        var issues = SceneDocumentValidator.Validate(DocumentWith(
            ModelNode("tray") with { Anchor = new SceneAnchor("book") },
            ModelNode("book", assetId: 2) with { Anchor = new SceneAnchor("tray") }));

        Assert.Contains(issues, i => i.Code == "AnchorCycle");
    }

    [Fact]
    public void Validate_When_A_Chain_Of_Anchors_Ends_Somewhere_Is_Accepted()
    {
        var issues = SceneDocumentValidator.Validate(DocumentWith(
            ModelNode("table"),
            ModelNode("tray", assetId: 2) with { Anchor = new SceneAnchor("table", Vec3.Zero) },
            ModelNode("book", assetId: 3) with { Anchor = new SceneAnchor("tray", Vec3.Zero) }));

        Assert.Empty(issues);
    }

    [Fact]
    public void Validate_When_A_Front_Axis_Is_Not_One_Of_The_Four_Returns_UnknownFrontAxis()
    {
        var issues = SceneDocumentValidator.Validate(DocumentWith(ModelNode("sofa") with { FrontAxis = "+Y" }));

        Assert.Contains(issues, i => i.Code == "UnknownFrontAxis" && i.Path == "nodes[0].frontAxis");
    }

    [Fact]
    public void Validate_When_The_Environment_Map_Is_Not_An_EnvironmentMap_Returns_InvalidEnvironmentMapRef()
    {
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            Array.Empty<SceneNode>(),
            Array.Empty<SceneLight>(),
            new SceneEnvironment(EnvironmentMap: new SceneAssetRef(SceneAssetTypes.Model, 5, 1)));

        var issues = SceneDocumentValidator.Validate(document);

        Assert.Contains(issues, i => i.Code == "InvalidEnvironmentMapRef");
    }
}
