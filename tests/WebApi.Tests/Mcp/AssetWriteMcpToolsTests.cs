using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Models;
using Application.Packs;
using Domain.Models;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Unit tests for the MCP write tools' cross-cutting behaviour — idempotency
/// claim/complete/release, error mapping, and the remote-upload branch — using mocked
/// handlers. The tools are thin pass-throughs, so this is where their own logic (not the
/// wrapped commands) is verified.
/// </summary>
public class AssetWriteMcpToolsTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static string Json(object value) => JsonSerializer.Serialize(value);

    /// <summary>An audit whose claim always succeeds (the key was free).</summary>
    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AgentOperationLog?)null);
        return audit;
    }

    [Fact]
    public async Task SetCategory_Claims_The_Key_Before_Writing_Then_Completes_It()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SetModelCategoryResponse(1, 5)));
        var audit = ClaimGranted();

        var result = await AssetWriteMcpTools.SetCategory(handler.Object, audit.Object, 1, "key-1", 5);

        Assert.Contains("\"ok\"", Json(result));
        audit.Verify(a => a.TryBeginAsync(
            It.Is<AgentWrite>(w => w.Operation == "set-category" && w.AssetId == 1), It.IsAny<CancellationToken>()),
            Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-1", "Model", 1, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SetCategory_Is_Idempotent_And_Skips_The_Write()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AgentOperationLog.Create("key-1", "set-category", Now, assetType: "Model", assetId: 1));

        var result = await AssetWriteMcpTools.SetCategory(handler.Object, audit.Object, 1, "key-1", 5);

        Assert.Contains("already-applied", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.CompleteAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task SetCategory_Failure_Releases_The_Claim_So_A_Retry_Can_Run()
    {
        // Regression: with claim-before-write, a failed write must give the key back —
        // otherwise retrying the same key answers "already-applied" for an operation
        // that never happened.
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<SetModelCategoryResponse>(new Error("ModelNotFound", "nope")));
        var audit = ClaimGranted();

        var result = await AssetWriteMcpTools.SetCategory(handler.Object, audit.Object, 1, "key-1", 5);

        Assert.Contains("ModelNotFound", Json(result));
        audit.Verify(a => a.AbandonAsync("key-1", It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task CreatePack_Losing_A_Concurrent_Claim_Does_Not_Create_A_Second_Pack()
    {
        // Regression: the check-then-act version looked the key up, found nothing, and
        // created the pack anyway — two concurrent calls with one key produced TWO Packs
        // rows and a unique-violation 500. Losing the claim must skip the handler.
        var handler = new Mock<ICommandHandler<CreatePackCommand, CreatePackResponse>>();
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(AgentOperationLog.Create("key-1", "create-pack", Now, assetType: "Pack", assetId: 4));

        var result = await AssetWriteMcpTools.CreatePack(handler.Object, audit.Object, "Race Probe", "key-1");

        Assert.Contains("already-applied", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<CreatePackCommand>(), It.IsAny<CancellationToken>()), Times.Never);
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
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ImportModel_Unreadable_Path_Releases_The_Claim()
    {
        var handler = new Mock<ICommandHandler<AddModelCommand, AddModelCommandResponse>>();
        var audit = ClaimGranted();

        var result = await AssetWriteMcpTools.ImportModel(
            handler.Object, audit.Object, "key-1", path: "/nonexistent/nope.glb");

        Assert.Contains("PathNotFound", Json(result));
        audit.Verify(a => a.AbandonAsync("key-1", It.IsAny<CancellationToken>()), Times.Once);
        handler.Verify(h => h.Handle(It.IsAny<AddModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
