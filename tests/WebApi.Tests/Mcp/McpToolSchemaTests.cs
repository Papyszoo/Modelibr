using System.Text.Json;
using ModelContextProtocol.Server;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The transport, not the feature.
///
/// Four of the new tools take arrays of objects, and <c>place_assets_batch</c>'s entries
/// carry arrays <i>inside</i> those objects. A schema that describes those badly is a tool a
/// strict MCP client refuses before the handler is ever reached - which is exactly how
/// <c>set_asset_metadata</c> was uncallable for a week while every unit test passed.
/// </summary>
public class McpToolSchemaTests
{
    private static JsonElement SchemaFor(string toolName, string methodName)
    {
        var method = typeof(SceneWriteMcpTools).GetMethod(methodName)
                     ?? typeof(AssetSearchMcpTools).GetMethod(methodName)
                     ?? typeof(AssetWriteMcpTools).GetMethod(methodName)
                     ?? typeof(AssetMetadataWriteMcpTools).GetMethod(methodName)
                     ?? typeof(ProjectWriteMcpTools).GetMethod(methodName);
        Assert.NotNull(method);

        var tool = McpServerTool.Create(method!);
        Assert.Equal(toolName, tool.ProtocolTool.Name);
        return tool.ProtocolTool.InputSchema;
    }

    private static JsonElement Property(JsonElement schema, string name) =>
        schema.GetProperty("properties").GetProperty(name);

    [Fact]
    public void PlaceAssetsBatch_Describes_Its_Placements_As_An_Array_Of_Objects()
    {
        var placements = Property(SchemaFor("place_assets_batch", "PlaceAssetsBatch"), "placements");

        Assert.Equal("array", placements.GetProperty("type").GetString());
        Assert.Equal("object", placements.GetProperty("items").GetProperty("type").GetString());
    }

    [Fact]
    public void A_Batch_Placements_Vector_Is_Described_As_An_Array_Of_Numbers()
    {
        // The one shape nothing here had proved: an array nested inside an object inside an
        // array. A client that cannot see a type for it sends a string, and the tool refuses
        // a call that was correct.
        var placements = Property(SchemaFor("place_assets_batch", "PlaceAssetsBatch"), "placements");
        var position = placements
            .GetProperty("items")
            .GetProperty("properties")
            .GetProperty("position");

        // A nullable field is emitted as ["array","null"], which is legal and is what a
        // client reads a type from. Both forms are accepted here; what must never happen is
        // the type being absent, which is the shape that made set_asset_metadata uncallable.
        Assert.Contains("array", TypeNames(position));
    }

    [Fact]
    public void OnSurface_Is_Described_As_An_Integer_On_Both_Placement_Paths()
    {
        // A nullable int inside an object inside an array is the same trap as the vector
        // above: a client that reads no type sends a string, and a placement that names the
        // sofa's seat is refused before the handler sees it.
        Assert.Contains("integer", TypeNames(Property(SchemaFor("place_asset", "PlaceAsset"), "onSurface")));

        var entry = Property(SchemaFor("place_assets_batch", "PlaceAssetsBatch"), "placements")
            .GetProperty("items")
            .GetProperty("properties")
            .GetProperty("onSurface");

        Assert.Contains("integer", TypeNames(entry));
    }

    /// <summary>The type names a schema node declares, whether as a string or an array of them.</summary>
    private static IReadOnlyList<string> TypeNames(JsonElement node)
    {
        if (!node.TryGetProperty("type", out var type))
        {
            return node.TryGetProperty("anyOf", out var anyOf)
                ? anyOf.EnumerateArray().SelectMany(TypeNames).ToList()
                : Array.Empty<string>();
        }

        return type.ValueKind == JsonValueKind.Array
            ? type.EnumerateArray().Select(t => t.GetString() ?? string.Empty).ToList()
            : [type.GetString() ?? string.Empty];
    }

    [Theory]
    [InlineData("search_many", "SearchMany", "searches")]
    [InlineData("get_assets", "GetAssets", "assets")]
    public void The_Batched_Reads_Describe_Their_Entries_As_Objects(
        string toolName, string methodName, string parameterName)
    {
        var parameter = Property(SchemaFor(toolName, methodName), parameterName);

        Assert.Equal("array", parameter.GetProperty("type").GetString());
        Assert.Equal("object", parameter.GetProperty("items").GetProperty("type").GetString());
    }

    [Theory]
    [InlineData("collapse_duplicate_assets", "CollapseDuplicateAssets", "redundantModelIds")]
    [InlineData("review_import_suggestions", "ReviewImportSuggestions", "modelIds")]
    public void The_Bulk_Curation_Tools_Describe_Their_Id_Lists_As_Arrays_Of_Integers(
        string toolName, string methodName, string parameterName)
    {
        // Both take a plain int[] and both recycle or revert what they are given. A client
        // that reads no item type sends the list as a string, and the call is refused before
        // the handler - the same shape that made set_asset_metadata uncallable.
        var parameter = Property(SchemaFor(toolName, methodName), parameterName);

        Assert.Contains("array", TypeNames(parameter));
        Assert.Contains("integer", TypeNames(parameter.GetProperty("items")));
    }

    [Fact]
    public void SetSceneRecommendations_Describes_A_Slot_Candidate_Pair()
    {
        var recommendations = Property(
            SchemaFor("set_scene_recommendations", "SetSceneRecommendations"), "recommendations");

        var properties = recommendations.GetProperty("items").GetProperty("properties");

        Assert.True(properties.TryGetProperty("slotId", out _));
        Assert.True(properties.TryGetProperty("candidateId", out _));
    }

    [Fact]
    public void PlaceAsset_Describes_Shape_Keys_As_An_Object_Of_Numbers()
    {
        // A dictionary is the shape a client is most likely to send as a string ("{\"Squash\":0.8}"),
        // which the handler could not read - the same trap set_asset_metadata's typeless patch
        // fell into. The schema has to say object, and its values have to say number.
        var shapeKeys = ObjectBody(Property(SchemaFor("place_asset", "PlaceAsset"), "shapeKeys"));

        Assert.Contains("object", TypeNames(shapeKeys));
        var values = shapeKeys.GetProperty("additionalProperties");
        Assert.Contains("number", TypeNames(values));
    }

    [Fact]
    public void PlaceAsset_Describes_Animation_As_An_Object_With_Its_Four_Fields()
    {
        var animation = ObjectBody(Property(SchemaFor("place_asset", "PlaceAsset"), "animation"));

        Assert.Contains("object", TypeNames(animation));
        var properties = animation.GetProperty("properties");
        foreach (var name in new[] { "clip", "loop", "speed", "timeOffset" })
        {
            Assert.True(properties.TryGetProperty(name, out _), $"animation.{name} missing from the schema");
        }
    }

    [Fact]
    public void PlaceAssetsBatch_Entries_Describe_Animation_And_Shape_Keys_Too()
    {
        // The batch speaks the same placement vocabulary as place_asset; if these two drift,
        // the batch path silently loses a field the single placement accepts.
        var entry = Property(SchemaFor("place_assets_batch", "PlaceAssetsBatch"), "placements")
            .GetProperty("items")
            .GetProperty("properties");

        var animation = ObjectBody(entry.GetProperty("animation"));
        Assert.Contains("object", TypeNames(animation));
        Assert.True(animation.GetProperty("properties").TryGetProperty("clip", out _));

        var shapeKeys = ObjectBody(entry.GetProperty("shapeKeys"));
        Assert.Contains("object", TypeNames(shapeKeys));
        Assert.Contains("number", TypeNames(shapeKeys.GetProperty("additionalProperties")));
    }

    [Fact]
    public void SetProjectProfile_Describes_Dimensions_And_Settings_As_Objects()
    {
        // Typed records, not a JSON blob: a strict client has to be able to see that
        // dimensions is an array of {dimension, options} objects and settings an object
        // with its fields - the shape the dictionary trap made clients send as a string.
        var dimensions = ArrayBody(Property(SchemaFor("set_project_profile", "SetProjectProfile"), "dimensions"));
        Assert.Contains("array", TypeNames(dimensions));

        var entry = dimensions.GetProperty("items").GetProperty("properties");
        Assert.True(entry.TryGetProperty("dimension", out _));
        Assert.True(entry.TryGetProperty("options", out _));

        var settings = ObjectBody(Property(SchemaFor("set_project_profile", "SetProjectProfile"), "settings"));
        Assert.Contains("object", TypeNames(settings));
        Assert.True(settings.GetProperty("properties").TryGetProperty("maxTrianglesPerAsset", out _));
    }

    /// <summary>
    /// The array half of a nullable schema node, which may be emitted as
    /// <c>anyOf: [{array…}, {null}]</c> rather than a type array.
    /// </summary>
    private static JsonElement ArrayBody(JsonElement node)
    {
        if (node.TryGetProperty("items", out _))
        {
            return node;
        }

        if (node.TryGetProperty("anyOf", out var anyOf))
        {
            foreach (var option in anyOf.EnumerateArray())
            {
                if (option.TryGetProperty("items", out _))
                {
                    return option;
                }
            }
        }

        return node;
    }

    /// <summary>
    /// The object half of a nullable schema node. A nullable parameter may be emitted as
    /// <c>anyOf: [{object…}, {null}]</c> rather than a type array, so unwrap either form.
    /// </summary>
    private static JsonElement ObjectBody(JsonElement node)
    {
        if (node.TryGetProperty("properties", out _) || node.TryGetProperty("additionalProperties", out _))
        {
            return node;
        }

        if (node.TryGetProperty("anyOf", out var anyOf))
        {
            foreach (var option in anyOf.EnumerateArray())
            {
                if (option.TryGetProperty("properties", out _) || option.TryGetProperty("additionalProperties", out _))
                {
                    return option;
                }
            }
        }

        return node;
    }
}
