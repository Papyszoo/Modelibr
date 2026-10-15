using System.ComponentModel;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using ModelContextProtocol.Server;
using WebApi.Endpoints;
using Xunit;

namespace WebApi.Tests.Endpoints;

/// <summary>
/// The read-only tool list behind the Settings "MCP explorer" view: every registered tool
/// with its description, in a stable ordinal order.
/// </summary>
public class McpToolEndpointsTests
{
    [McpServerToolType]
    private static class TestTools
    {
        [McpServerTool(Name = "search_assets"), Description("Search the library.")]
        public static string SearchAssets() => string.Empty;

        [McpServerTool(Name = "get_asset"), Description("Read one asset.")]
        public static string GetAsset() => string.Empty;

        // Uppercase name: ordinal ordering puts it before the lowercase tools, which a
        // case-insensitive comparison would not.
        [McpServerTool(Name = "Zeta_tool"), Description("Ordinal sorting probe.")]
        public static string Zeta() => string.Empty;

        [McpServerTool(Name = "create_material"), Description("Create a global material.")]
        public static string CreateMaterial() => string.Empty;
    }

    private static McpServerTool Tool(string methodName) =>
        McpServerTool.Create(typeof(TestTools).GetMethod(methodName)!);

    private static McpServerTool[] AllTools() =>
    [
        Tool(nameof(TestTools.SearchAssets)),
        Tool(nameof(TestTools.GetAsset)),
        Tool(nameof(TestTools.Zeta)),
        Tool(nameof(TestTools.CreateMaterial)),
    ];

    private static JsonElement[] Parse(IEnumerable<McpServerTool> tools)
    {
        var value = Assert.IsAssignableFrom<IValueHttpResult>(McpAgentEndpoints.GetTools(tools)).Value;

        using var document = JsonDocument.Parse(
            JsonSerializer.Serialize(value, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        return document.RootElement.EnumerateArray().Select(element => element.Clone()).ToArray();
    }

    [Fact]
    public void GetMcpTools_Returns_Registered_Tools_Sorted_Ordinally_With_Descriptions()
    {
        var tools = Parse(AllTools());

        Assert.Equal(
            ["Zeta_tool", "create_material", "get_asset", "search_assets"],
            tools.Select(t => t.GetProperty("name").GetString()));
        Assert.Equal(
            "Search the library.",
            tools.Single(t => t.GetProperty("name").GetString() == "search_assets").GetProperty("description").GetString());
        Assert.Equal(
            "Create a global material.",
            tools.Single(t => t.GetProperty("name").GetString() == "create_material").GetProperty("description").GetString());
    }
}
