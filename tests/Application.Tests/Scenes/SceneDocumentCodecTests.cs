using Application.Scenes;
using Domain.Scenes;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The JSON boundary. The rule under test is that a document which does not parse, or does
/// not validate, is an <i>error</i> - the feature this replaces caught the parse failure,
/// substituted an empty scene, and reported success.
/// </summary>
public class SceneDocumentCodecTests
{
    private const string MinimalDocument = """
        {"schemaVersion":1,"nodes":[],"lights":[]}
        """;

    [Fact]
    public void Parse_When_Document_Is_Well_Formed_Succeeds()
    {
        var result = SceneDocumentCodec.Parse(MinimalDocument);

        Assert.True(result.IsSuccess);
        Assert.Equal(SceneDocument.CurrentSchemaVersion, result.Value.SchemaVersion);
    }

    [Fact]
    public void Parse_When_Json_Is_Malformed_Returns_DocumentUnreadable()
    {
        var result = SceneDocumentCodec.Parse("{\"schemaVersion\":1,\"nodes\":");

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.DocumentUnreadable", result.Error.Code);
    }

    [Fact]
    public void Parse_When_Document_Is_Empty_Returns_DocumentMissing()
    {
        Assert.Equal("Scene.DocumentMissing", SceneDocumentCodec.Parse("   ").Error.Code);
    }

    [Fact]
    public void Parse_When_A_Member_Is_Misspelled_Is_Rejected_Rather_Than_Ignored()
    {
        // Ignoring unknown members looks forgiving and is the opposite for an agent: the
        // misspelling would be dropped in silence and the agent would believe it placed
        // something.
        var json = """
            {"schemaVersion":1,"lights":[],"nodes":[
              {"id":"a","transform":{"positon":{"x":0,"y":0,"z":0},"rotationEuler":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
               "asset":{"assetType":"Model","assetId":1,"versionId":1}}]}
            """;

        var result = SceneDocumentCodec.Parse(json);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.DocumentUnreadable", result.Error.Code);
    }

    [Fact]
    public void Parse_When_A_Model_Node_Is_Unpinned_Returns_DocumentInvalid()
    {
        var json = """
            {"schemaVersion":1,"lights":[],"nodes":[
              {"id":"a","transform":{"position":{"x":0,"y":0,"z":0},"rotationEuler":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
               "asset":{"assetType":"Model","assetId":1}}]}
            """;

        var result = SceneDocumentCodec.Parse(json);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.DocumentInvalid", result.Error.Code);
        Assert.Contains("VersionRequired", result.Error.Message);
    }

    [Fact]
    public void Parse_Reports_Every_Problem_In_One_Error()
    {
        var json = """
            {"schemaVersion":1,"lights":[{"id":"key","type":"laser","position":{"x":0,"y":0,"z":0}}],"nodes":[
              {"id":"a","transform":{"position":{"x":0,"y":0,"z":0},"rotationEuler":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
               "asset":{"assetType":"Model","assetId":1}},
              {"id":"a","transform":{"position":{"x":0,"y":0,"z":0},"rotationEuler":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
               "asset":{"assetType":"Model","assetId":2,"versionId":1}}]}
            """;

        var result = SceneDocumentCodec.Parse(json);

        Assert.Contains("VersionRequired", result.Error.Message);
        Assert.Contains("DuplicateNodeId", result.Error.Message);
        Assert.Contains("UnknownLightType", result.Error.Message);
    }

    [Fact]
    public void Serialize_Then_Parse_Round_Trips_A_Full_Document()
    {
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[]
            {
                new SceneNode(
                    "lamp-1",
                    new SceneTransform(new Vec3(1, 2, 3), new Vec3(0, 90, 0), new Vec3(1, 1, 1)),
                    Asset: new SceneAssetRef(SceneAssetTypes.Model, 42, 7),
                    Name: "street lamp",
                    SlotId: "lamp-slot",
                    Material: new SceneMaterialBinding(9, "night")),
                new SceneNode(
                    "block-1",
                    SceneTransform.Identity,
                    Primitive: new ScenePrimitive(ScenePrimitiveShapes.Box, new Vec3(4, 3, 4)),
                    Visible: false),
            },
            new[] { new SceneLight("key", SceneLightTypes.Directional, new Vec3(5, 10, 5), 1.4, "#ffd9a0", new Vec3(0, 0, 0), "sun") },
            new SceneEnvironment(new SceneAssetRef(SceneAssetTypes.EnvironmentMap, 3), "#101014", -0.5));

        var round = SceneDocumentCodec.Parse(SceneDocumentCodec.Serialize(document));

        Assert.True(round.IsSuccess);

        // Element-wise: the records carry collections, and record equality compares those by
        // reference, so comparing the documents themselves would pass or fail on whether the
        // deserializer happened to produce an array or a List.
        Assert.Equal(document.SchemaVersion, round.Value.SchemaVersion);
        Assert.Equal(document.Environment, round.Value.Environment);
        Assert.Equal(document.Nodes, round.Value.Nodes);
        Assert.Equal(document.Lights, round.Value.Lights);
    }

    [Fact]
    public void ParseStored_When_A_Stored_Document_Is_Unreadable_Says_So_And_Says_It_Is_Preserved()
    {
        // A user losing a scene must be told, and told the file is still there - not handed
        // an empty stage and a toast.
        var result = SceneDocumentCodec.ParseStored("{ this is not a scene", sceneId: 12);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.StoredDocumentUnreadable", result.Error.Code);
        Assert.Contains("preserved as-is", result.Error.Message);
    }
}
