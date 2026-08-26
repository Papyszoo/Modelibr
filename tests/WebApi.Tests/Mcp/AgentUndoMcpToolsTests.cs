using System.Text.Json;
using Application.Agents;
using Microsoft.Extensions.Configuration;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The gates in front of the tools that can destroy work: a default dry run, an operator
/// flag, and the destructive scope. What is verified here is that each one refuses
/// <b>before</b> anything is applied, since these are the only agent tools whose mistakes
/// are not simply another write.
/// </summary>
public class AgentUndoMcpToolsTests
{
    private static string Json(object value) => JsonSerializer.Serialize(value);

    private static IConfiguration Configuration(bool destructiveEnabled) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["MCP_DESTRUCTIVE_ENABLED"] = destructiveEnabled ? "true" : "false",
            })
            .Build();

    private static Mock<IAgentOperationReverser> Reverser(bool destructivePlan)
    {
        var step = new ReversalStep(
            "key-1", destructivePlan ? "import-model" : "set-tags", "Model", 4,
            "effect", IsDestructive: destructivePlan, IsSupported: true);

        var reverser = new Mock<IAgentOperationReverser>();
        reverser.Setup(r => r.PlanAsync(It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new ReversalPlan([step])));
        reverser.Setup(r => r.ApplyAsync(It.IsAny<ReversalPlan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success<IReadOnlyList<ReversalStepResult>>(
                [new ReversalStepResult("key-1", step.Operation, Reversed: true, "done")]));
        return reverser;
    }

    [Fact]
    public async Task ReverseOperation_Defaults_To_A_Dry_Run_That_Changes_Nothing()
    {
        var reverser = Reverser(destructivePlan: true);

        var result = await AgentUndoMcpTools.ReverseOperation(
            reverser.Object, McpCallerContext.Unauthenticated(), Configuration(true), "key-1");

        Assert.Contains("dry-run", Json(result));
        reverser.Verify(r => r.ApplyAsync(It.IsAny<ReversalPlan>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Reversing_A_Non_Destructive_Write_Does_Not_Need_The_Destructive_Flag()
    {
        // Restoring replaced tags destroys nothing, so demanding the deletion flag for it
        // would push operators into enabling deletion to get undo.
        var reverser = Reverser(destructivePlan: false);

        var result = await AgentUndoMcpTools.ReverseOperation(
            reverser.Object, McpCallerContext.Unauthenticated(), Configuration(false), "key-1", dryRun: false);

        Assert.Contains("reversed", Json(result));
        reverser.Verify(r => r.ApplyAsync(It.IsAny<ReversalPlan>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Reversing_A_Write_That_Would_Delete_Is_Refused_While_The_Flag_Is_Off()
    {
        var reverser = Reverser(destructivePlan: true);

        var result = await AgentUndoMcpTools.ReverseOperation(
            reverser.Object, McpCallerContext.Unauthenticated(), Configuration(false), "key-1", dryRun: false);

        Assert.Contains("DestructiveDisabled", Json(result));
        reverser.Verify(r => r.ApplyAsync(It.IsAny<ReversalPlan>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Token_Without_The_Destructive_Scope_Cannot_Reverse_An_Import()
    {
        var reverser = Reverser(destructivePlan: true);
        var writer = McpCallerContext.For(new McpPrincipal("curator", [McpScope.Read, McpScope.Write]));

        var result = await AgentUndoMcpTools.ReverseOperation(
            reverser.Object, writer, Configuration(true), "key-1", dryRun: false);

        Assert.Contains("ScopeRequired", Json(result));
        reverser.Verify(r => r.ApplyAsync(It.IsAny<ReversalPlan>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task DeleteAsset_Defaults_To_A_Dry_Run_And_Never_Claims_The_Key()
    {
        var audit = new Mock<IAgentAudit>();

        var result = await AgentUndoMcpTools.DeleteAsset(
            audit.Object, McpCallerContext.Unauthenticated(), Configuration(true),
            new Mock<IServiceProvider>().Object, "Model", 4, "key-2");

        Assert.Contains("dry-run", Json(result));
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task DeleteAsset_Refuses_An_Unknown_Family_With_The_Vocabulary()
    {
        // An agent that guesses "Texture" gets the valid list back rather than a bare
        // error, which is the difference between recovering now and burning a turn.
        var result = await AgentUndoMcpTools.DeleteAsset(
            new Mock<IAgentAudit>().Object, McpCallerContext.Unauthenticated(), Configuration(true),
            new Mock<IServiceProvider>().Object, "Texture", 4, "key-3", dryRun: false);

        var json = Json(result);
        Assert.Contains("UnknownAssetType", json);
        Assert.Contains("TextureSet", json);
    }

    [Fact]
    public async Task DeleteAsset_Is_Refused_While_The_Destructive_Flag_Is_Off()
    {
        var audit = new Mock<IAgentAudit>();

        var result = await AgentUndoMcpTools.DeleteAsset(
            audit.Object, McpCallerContext.Unauthenticated(), Configuration(false),
            new Mock<IServiceProvider>().Object, "Model", 4, "key-4", dryRun: false);

        Assert.Contains("DestructiveDisabled", Json(result));
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
