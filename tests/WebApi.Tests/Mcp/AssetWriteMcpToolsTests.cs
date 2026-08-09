using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Models;
using Domain.Models;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Unit tests for the MCP write tools' cross-cutting behaviour — idempotency
/// short-circuit, audit recording, error mapping, and the remote-upload branch — using
/// mocked handlers. The tools are thin pass-throughs, so this is where their own logic
/// (not the wrapped commands) is verified.
/// </summary>
public class AssetWriteMcpToolsTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static string Json(object value) => JsonSerializer.Serialize(value);

    [Fact]
    public async Task SetCategory_Applies_And_Records_Audit()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SetModelCategoryResponse(1, 5)));
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.FindAsync("key-1", It.IsAny<CancellationToken>())).ReturnsAsync((AgentOperationLog?)null);

        var result = await AssetWriteMcpTools.SetCategory(handler.Object, audit.Object, 1, "key-1", 5);

        Assert.Contains("\"ok\"", Json(result));
        audit.Verify(a => a.RecordAsync(
            It.Is<AgentWrite>(w => w.Operation == "set-category" && w.AssetId == 1), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task SetCategory_Is_Idempotent_And_Skips_The_Write()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.FindAsync("key-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(AgentOperationLog.Create("key-1", "set-category", Now, assetType: "Model", assetId: 1));

        var result = await AssetWriteMcpTools.SetCategory(handler.Object, audit.Object, 1, "key-1", 5);

        Assert.Contains("already-applied", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.RecordAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SetCategory_Failure_Returns_Error_And_Does_Not_Audit()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<SetModelCategoryResponse>(new Error("ModelNotFound", "nope")));
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.FindAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AgentOperationLog?)null);

        var result = await AssetWriteMcpTools.SetCategory(handler.Object, audit.Object, 1, "key-1", 5);

        Assert.Contains("ModelNotFound", Json(result));
        audit.Verify(a => a.RecordAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ImportModel_Without_Path_Returns_Remote_Upload_Instructions()
    {
        var handler = new Mock<ICommandHandler<AddModelCommand, AddModelCommandResponse>>();
        var audit = new Mock<IAgentAudit>();

        var result = await AssetWriteMcpTools.ImportModel(handler.Object, audit.Object, "key-1", path: null);

        var json = Json(result);
        Assert.Contains("upload-required", json);
        Assert.Contains("/models/multifile", json);
        // The control-plane call must not touch the audit log or import anything.
        handler.Verify(h => h.Handle(It.IsAny<AddModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.FindAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
