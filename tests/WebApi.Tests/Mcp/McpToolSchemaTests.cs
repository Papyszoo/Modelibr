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
                     ?? typeof(AssetSearchMcpTools).GetMethod(methodName);
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

    [Fact]
    public void SetSceneRecommendations_Describes_A_Slot_Candidate_Pair()
    {
        var recommendations = Property(
            SchemaFor("set_scene_recommendations", "SetSceneRecommendations"), "recommendations");

        var properties = recommendations.GetProperty("items").GetProperty("properties");

        Assert.True(properties.TryGetProperty("slotId", out _));
        Assert.True(properties.TryGetProperty("candidateId", out _));
    }
}
