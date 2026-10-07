using System.Text.Json;
using Microsoft.AspNetCore.Http;
using WebApi.Endpoints;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The named-agent definitions. Validation is the point: a definition that names a tool or
/// family that does not exist would expose a surface nobody configured, so it fails at
/// startup rather than being skipped.
/// </summary>
public class McpAgentRegistryTests
{
    private static readonly Dictionary<string, string> KnownTools = new()
    {
        ["search_assets"] = "Search the library.",
        ["get_asset"] = "Read one asset.",
    };

    private const string ValidJson = """
        [
          {
            "name": "stylist",
            "description": "Dresses models.",
            "main": true,
            "families": ["Model", "TextureSet"],
            "tools": ["search_assets", "get_asset"],
            "instructions": "Dress each model."
          }
        ]
        """;

    [Fact]
    public void A_Definition_That_Names_An_Unknown_Tool_Fails_Startup()
    {
        var json = ValidJson.Replace("search_assets", "no_such_tool");

        var thrown = Assert.Throws<InvalidOperationException>(
            () => McpAgentRegistry.Load(json, KnownTools, McpAgentRegistry.KnownFamilies));

        Assert.Contains("no_such_tool", thrown.Message);
    }

    [Fact]
    public void A_Definition_That_Names_An_Unknown_Family_Fails_Startup()
    {
        var json = ValidJson.Replace("TextureSet", "Material");

        var thrown = Assert.Throws<InvalidOperationException>(
            () => McpAgentRegistry.Load(json, KnownTools, McpAgentRegistry.KnownFamilies));

        Assert.Contains("Material", thrown.Message);
    }

    [Fact]
    public void A_Valid_Definition_Resolves_Its_Tool_Descriptions_And_Is_Found_Case_Insensitively()
    {
        var registry = McpAgentRegistry.Load(ValidJson, KnownTools, McpAgentRegistry.KnownFamilies);

        var agent = registry.Find("STYLIST");

        Assert.NotNull(agent);
        Assert.Equal("stylist", agent!.Name);
        Assert.Equal(["Model", "TextureSet"], agent.Families);
        Assert.Equal("Search the library.", agent.Tools.Single(t => t.Name == "search_assets").Description);
        Assert.Equal("Dress each model.", agent.Instructions);
        Assert.True(agent.IsMain);
        Assert.Null(registry.Find("nobody"));
    }

    [Fact]
    public void A_Definition_With_No_Main_Agent_Fails_Startup()
    {
        var json = ValidJson.Replace("\"main\": true", "\"main\": false");

        var thrown = Assert.Throws<InvalidOperationException>(
            () => McpAgentRegistry.Load(json, KnownTools, McpAgentRegistry.KnownFamilies));

        Assert.Contains("main", thrown.Message);
    }

    [Fact]
    public void A_Definition_With_Two_Main_Agents_Fails_Startup()
    {
        // Two agents claiming the main role would leave the harness no way to know which one
        // the user talks to, so it is a configuration error, not a last-one-wins tie-break.
        const string json = """
            [
              {
                "name": "first",
                "description": "First.",
                "main": true,
                "families": ["Model"],
                "tools": ["search_assets"]
              },
              {
                "name": "second",
                "description": "Second.",
                "main": true,
                "families": ["Model"],
                "tools": ["get_asset"]
              }
            ]
            """;

        var thrown = Assert.Throws<InvalidOperationException>(
            () => McpAgentRegistry.Load(json, KnownTools, McpAgentRegistry.KnownFamilies));

        Assert.Contains("first, second", thrown.Message);
    }

    [Fact]
    public void The_Shipped_Definitions_Only_Name_Real_Tools_And_Families()
    {
        // The file ships beside the server; this proves every name in it exists before the
        // server is ever asked to boot with it.
        var path = Path.Combine(AppContext.BaseDirectory, "Mcp", "mcp-agents.json");
        var known = McpAgentRegistry.DiscoverKnownTools(typeof(AssetSearchMcpTools).Assembly);

        var registry = McpAgentRegistry.FromFile(path, known);

        Assert.Equal(["modelibr", "asset-scout", "scene-builder", "stylist", "designer"],
            registry.Agents.Select(a => a.Name));
        // The main agent is the one the user talks to, and it is exactly one.
        Assert.Equal("modelibr", registry.Agents.Single(a => a.IsMain).Name);
        Assert.All(registry.Agents, a => Assert.False(string.IsNullOrWhiteSpace(a.Instructions)));
    }

    [Fact]
    public void GetMcpAgents_Returns_Each_Agents_Name_Description_Families_And_Tool_Descriptions()
    {
        var registry = McpAgentRegistry.Load(ValidJson, KnownTools, McpAgentRegistry.KnownFamilies);

        var value = Assert.IsAssignableFrom<IValueHttpResult>(McpAgentEndpoints.GetAgents(registry)).Value;

        using var document = JsonDocument.Parse(
            JsonSerializer.Serialize(value, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var agent = document.RootElement[0];
        Assert.Equal("stylist", agent.GetProperty("name").GetString());
        Assert.Equal("Dresses models.", agent.GetProperty("description").GetString());
        Assert.Equal(2, agent.GetProperty("families").GetArrayLength());

        var tool = agent.GetProperty("tools")[0];
        Assert.Equal("search_assets", tool.GetProperty("name").GetString());
        Assert.Equal("Search the library.", tool.GetProperty("description").GetString());
    }
}
