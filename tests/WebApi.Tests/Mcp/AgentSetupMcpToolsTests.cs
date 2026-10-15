using System.Text.Json;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The setup hand-off: the shape a harness's model receives and writes into its own format.
/// </summary>
public class AgentSetupMcpToolsTests
{
    private static readonly Dictionary<string, string> KnownTools = new()
    {
        ["search_assets"] = "Search the library.",
        ["get_asset"] = "Read one asset.",
    };

    private const string RegistryJson = """
        [
          {
            "name": "modelibr",
            "description": "Main.",
            "main": true,
            "families": [],
            "tools": ["search_assets"],
            "instructions": "Talk to the user."
          },
          {
            "name": "asset-scout",
            "description": "Scout.",
            "main": false,
            "families": ["Model"],
            "tools": ["search_assets", "get_asset"],
            "instructions": "Find assets."
          },
          {
            "name": "stylist",
            "description": "Stylist.",
            "main": false,
            "families": ["Model"],
            "tools": ["get_asset"],
            "instructions": "Dress models."
          }
        ]
        """;

    private static McpAgentRegistry Registry() =>
        McpAgentRegistry.Load(RegistryJson, KnownTools, McpAgentRegistry.KnownFamilies);

    private static JsonElement Result() =>
        JsonSerializer.SerializeToElement(AgentSetupMcpTools.GetAgentSetup(Registry()));

    [Fact]
    public void The_Main_Agent_And_Its_Subagents_Are_Described_In_File_Order()
    {
        var document = Result();

        Assert.StartsWith("Create these agents", document.GetProperty("howToInstall").GetString());

        var main = document.GetProperty("mainAgent");
        Assert.Equal("modelibr", main.GetProperty("name").GetString());
        Assert.Equal("Talk to the user.", main.GetProperty("instructions").GetString());
        Assert.Equal(["search_assets"], ToolNames(main));

        var subagents = document.GetProperty("subagents");
        Assert.Equal(2, subagents.GetArrayLength());
        Assert.Equal("asset-scout", subagents[0].GetProperty("name").GetString());
        Assert.Equal(["search_assets", "get_asset"], ToolNames(subagents[0]));
        Assert.Equal("stylist", subagents[1].GetProperty("name").GetString());
    }

    [Fact]
    public void Each_Agent_Path_Is_Relative_To_The_Harness_Modelibr_Url()
    {
        var document = Result();

        Assert.Equal("/agents/modelibr", document.GetProperty("mainAgent").GetProperty("mcpPath").GetString());
        Assert.Equal("/agents/asset-scout", document.GetProperty("subagents")[0].GetProperty("mcpPath").GetString());
    }

    private static string[] ToolNames(JsonElement agent) =>
        agent.GetProperty("tools").EnumerateArray().Select(t => t.GetString()!).ToArray();
}
