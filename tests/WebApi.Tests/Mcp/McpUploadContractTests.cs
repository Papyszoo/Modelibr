using System.Text.Json;
using WebApi.Infrastructure;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// What an agent that cannot reach the server's filesystem is told about the HTTP data plane.
///
/// Two tools hand this out - <c>import_model</c>'s remote branch and
/// <c>request_upload_ticket</c> - and they had already drifted: one named the multi-file and
/// zip routes with a worked example, the other offered <c>POST /models</c> alone. An agent
/// uploading a loose <c>.gltf</c> through the second one was told a contract that imports the
/// file without its geometry, and had no reason to think another existed.
/// </summary>
public class McpUploadContractTests
{
    [Fact]
    public void Every_Family_Carries_A_Worked_Example()
    {
        // A field list says what the parts are called. It does not say what a correct call
        // looks like, and an agent gets one guess before it burns a turn.
        Assert.All(
            McpUploadContracts.Targets.Values,
            t => Assert.False(string.IsNullOrWhiteSpace(t.Example), $"{t.AssetType} has no worked example."));
    }

    [Fact]
    public void The_Model_Family_Names_The_Routes_A_Loose_Gltf_Actually_Needs()
    {
        var json = JsonSerializer.Serialize(McpUploadContracts.ModelAlternatives);

        Assert.Contains("POST /models/multifile", json);
        Assert.Contains("POST /models/zip", json);
        // The one field whose absence is a silent broken import rather than a 400.
        Assert.Contains("paths", json);
    }

    [Fact]
    public void Adding_A_Channel_Targets_The_Set_It_Was_Asked_About()
    {
        var target = McpUploadContracts.AddTextureChannel(42);

        Assert.Equal("POST /texture-sets/42/textures/with-file", target.Endpoint);
        Assert.Equal(AgentAssetFamilies.TextureSet, target.AssetType);
    }

    [Fact]
    public void A_Described_Target_Carries_Endpoint_Fields_And_Example_Together()
    {
        var json = JsonSerializer.Serialize(
            McpUploadContracts.Describe(McpUploadContracts.Targets[AgentAssetFamilies.Sprite]));

        Assert.Contains("POST /sprites/with-file", json);
        Assert.Contains("spriteType", json);
        Assert.Contains("SpriteSheet", json);
    }
}
