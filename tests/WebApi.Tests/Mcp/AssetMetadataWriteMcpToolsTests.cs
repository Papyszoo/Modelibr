using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Metadata;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Unit tests for <c>set_asset_metadata</c>'s handling of the <c>fields</c> patch. The tool is
/// a thin pass-through, so what is verified here is which shapes of <c>fields</c> it accepts
/// and what reaches the command.
/// </summary>
public class AssetMetadataWriteMcpToolsTests
{
    private static string Json(object value) => JsonSerializer.Serialize(value);

    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    private static AssetMetadataResponse Response() => new(
        "Model", 1, "probe", 1, 1,
        Array.Empty<AssetMetadataValue>(),
        new AssetMetadataCompleteness(0, 0, Array.Empty<string>()));

    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, "gen-1"));
        // Settling reports whether this caller still owned the claim. True is the ordinary
        // case; a false here means the lease lapsed mid-call and the response changes, which
        // is its own test.
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.AbandonAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    private static Mock<IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse>> Read()
    {
        var read = new Mock<IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse>>();
        read.Setup(h => h.Handle(It.IsAny<ReadAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Response()));
        return read;
    }

    private static Mock<ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse>> Write()
    {
        var handler = new Mock<ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Response()));
        return handler;
    }

    [Fact]
    public async Task Fields_As_A_Json_Object_Reaches_The_Command()
    {
        var handler = Write();

        var result = await AssetMetadataWriteMcpTools.SetAssetMetadata(
            handler.Object, Read().Object, ClaimGranted().Object, Caller(),
            "Model", 1,
            JsonSerializer.SerializeToElement(new { styles = new[] { "Low Poly" } }),
            "key-object");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<SetAssetMetadataCommand>(c => c.Fields.ContainsKey("styles")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Fields_As_A_Json_String_Reaches_The_Command_Unchanged()
    {
        // Regression: `fields` is a JsonElement, which the schema generator describes with no
        // `type` at all. Strict MCP clients resolve that by sending the patch as a JSON
        // string, and refusing it made the tool uncallable from them - the reason this tool
        // had never run against a live stack.
        var handler = Write();

        var result = await AssetMetadataWriteMcpTools.SetAssetMetadata(
            handler.Object, Read().Object, ClaimGranted().Object, Caller(),
            "Model", 1,
            JsonSerializer.SerializeToElement("{\"styles\":[\"Low Poly\"],\"license\":\"CC0\"}"),
            "key-string");

        Assert.Contains("\"ok\"", Json(result));
        handler.Verify(h => h.Handle(
            It.Is<SetAssetMetadataCommand>(c =>
                c.Fields.ContainsKey("styles") && c.Fields.ContainsKey("license")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task A_String_That_Is_Not_Json_Is_Refused_Without_Writing()
    {
        var handler = Write();

        var result = await AssetMetadataWriteMcpTools.SetAssetMetadata(
            handler.Object, Read().Object, ClaimGranted().Object, Caller(),
            "Model", 1,
            JsonSerializer.SerializeToElement("not json at all"),
            "key-bad-string");

        Assert.Contains("InvalidMetadataPatch", Json(result));
        handler.Verify(h => h.Handle(
            It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Json_Array_Is_Refused_Without_Writing()
    {
        // An array parses, so the guard has to check the parsed shape, not just that it parsed.
        var handler = Write();

        var result = await AssetMetadataWriteMcpTools.SetAssetMetadata(
            handler.Object, Read().Object, ClaimGranted().Object, Caller(),
            "Model", 1,
            JsonSerializer.SerializeToElement("[\"Low Poly\"]"),
            "key-array-string");

        Assert.Contains("InvalidMetadataPatch", Json(result));
        handler.Verify(h => h.Handle(
            It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
