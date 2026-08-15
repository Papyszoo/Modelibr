using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Agents;
using Application.Models;
using Application.Packs;
using Domain.Models;
using Moq;
using SharedKernel;
using WebApi.Infrastructure;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Unit tests for the MCP write tools' cross-cutting behaviour - idempotency
/// claim/complete/release, error mapping, and the remote-upload branch - using mocked
/// handlers. The tools are thin pass-throughs, so this is where their own logic (not the
/// wrapped commands) is verified.
/// </summary>
public class AssetWriteMcpToolsTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static string Json(object value) => JsonSerializer.Serialize(value);

    /// <summary>An unauthenticated local caller - every scope, no identity (no MCP_TOKENS configured).</summary>
    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    /// <summary>
    /// The model read the write tools now perform to record what they are about to
    /// overwrite. Returns a model with no category and no tags unless told otherwise.
    /// </summary>
    private static Mock<IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse>> ModelRead(
        int modelId = 1, int? categoryId = null)
    {
        var model = new ModelDetailDto
        {
            Id = modelId,
            Name = "probe",
            Tags = new[] { "old-tag" },
            Description = "old description",
            Category = categoryId is null ? null : new ModelCategorySummaryDto { Id = categoryId.Value, Name = "Old" },
        };

        var read = new Mock<IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse>>();
        read.Setup(h => h.Handle(It.IsAny<GetModelByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new GetModelByIdQueryResponse(model)));
        return read;
    }

    /// <summary>An audit whose claim always succeeds (the key was free).</summary>
    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null));
        return audit;
    }

    /// <summary>An audit reporting the key already ran to completion.</summary>
    private static Mock<IAgentAudit> ClaimCompleted(string key, string operation, string? assetType, int? assetId)
    {
        var entry = AgentOperationLog.Create(key, operation, Now, assetType: assetType, assetId: assetId);
        entry.MarkCompleted(Now, assetType, assetId, "{}");
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.AlreadyApplied, entry));
        return audit;
    }

    [Fact]
    public async Task SetCategory_Claims_The_Key_Before_Writing_Then_Completes_It()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SetModelCategoryResponse(1, 5)));
        var audit = ClaimGranted();

        var result = await AssetWriteMcpTools.SetCategory(
            ModelRead().Object, handler.Object, audit.Object, Caller(), 1, "key-1", 5);

        Assert.Contains("\"ok\"", Json(result));
        audit.Verify(a => a.TryBeginAsync(
            It.Is<AgentWrite>(w => w.Operation == "set-category" && w.AssetId == 1), It.IsAny<CancellationToken>()),
            Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-1", "Model", 1, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SetCategory_Is_Idempotent_And_Skips_The_Write()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        var audit = ClaimCompleted("key-1", "set-category", "Model", 1);

        var result = await AssetWriteMcpTools.SetCategory(
            ModelRead().Object, handler.Object, audit.Object, Caller(), 1, "key-1", 5);

        Assert.Contains("already-applied", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.CompleteAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task SetCategory_Failure_Releases_The_Claim_So_A_Retry_Can_Run()
    {
        // Regression: with claim-before-write, a failed write must give the key back -
        // otherwise retrying the same key answers "already-applied" for an operation
        // that never happened.
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<SetModelCategoryResponse>(new Error("ModelNotFound", "nope")));
        var audit = ClaimGranted();

        var result = await AssetWriteMcpTools.SetCategory(
            ModelRead().Object, handler.Object, audit.Object, Caller(), 1, "key-1", 5);

        Assert.Contains("ModelNotFound", Json(result));
        audit.Verify(a => a.AbandonAsync("key-1", It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task CreatePack_Losing_A_Concurrent_Claim_Does_Not_Create_A_Second_Pack()
    {
        // Regression: the check-then-act version looked the key up, found nothing, and
        // created the pack anyway - two concurrent calls with one key produced TWO Packs
        // rows and a unique-violation 500. Losing the claim must skip the handler.
        var handler = new Mock<ICommandHandler<CreatePackCommand, CreatePackResponse>>();
        var audit = ClaimCompleted("key-1", "create-pack", "Pack", 4);

        var result = await AssetWriteMcpTools.CreatePack(handler.Object, audit.Object, Caller(), "Race Probe", "key-1");

        Assert.Contains("already-applied", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<CreatePackCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Live_Claim_Reports_In_Progress_Rather_Than_Already_Applied()
    {
        // Regression: the claim row is written BEFORE the mutation, so "a row exists"
        // never proved the write landed. Answering already-applied for a Pending claim
        // told a retrying agent its mutation had been applied when the original caller
        // may have crashed before touching anything.
        var pending = AgentOperationLog.Create("key-7", "create-pack", Now, assetType: "Pack");
        var handler = new Mock<ICommandHandler<CreatePackCommand, CreatePackResponse>>();
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.InProgress, pending));

        var result = await AssetWriteMcpTools.CreatePack(handler.Object, audit.Object, Caller(), "Race Probe", "key-7");

        var json = Json(result);
        Assert.Contains("in-progress", json);
        Assert.DoesNotContain("already-applied", json);
        handler.Verify(h => h.Handle(It.IsAny<CreatePackCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Thrown_Handler_Releases_The_Claim_Before_Propagating()
    {
        // Regression: only RETURNED failures released the claim. An exception (or a
        // cancellation) left the key Pending forever, so every later retry of that key
        // was refused as already-applied for a mutation that never ran.
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("connection reset"));
        var audit = ClaimGranted();

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => AssetWriteMcpTools.SetCategory(
                ModelRead().Object, handler.Object, audit.Object, Caller(), 1, "key-8", 5));

        audit.Verify(a => a.AbandonAsync("key-8", It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task A_Cancelled_Write_Releases_The_Claim()
    {
        var handler = new Mock<ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetModelCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        var audit = ClaimGranted();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => AssetWriteMcpTools.SetCategory(
                ModelRead().Object, handler.Object, audit.Object, Caller(), 1, "key-10", 5,
                cancellationToken: cts.Token));

        // Released with an uncancelled token - the caller's token is already dead.
        audit.Verify(a => a.AbandonAsync("key-10", CancellationToken.None), Times.Once);
    }

    [Fact]
    public async Task ImportModel_Without_Path_Returns_An_Upload_Ticket_And_Instructions()
    {
        var handler = new Mock<ICommandHandler<AddModelCommand, AddModelCommandResponse>>();
        var audit = new Mock<IAgentAudit>();
        var tickets = Tickets();

        var result = await AssetWriteMcpTools.ImportModel(
            handler.Object, audit.Object, Caller(), tickets.Object, "key-1", path: null);

        var json = Json(result);
        Assert.Contains("upload-required", json);
        Assert.Contains("/models/multifile", json);
        // The ticket is what makes the remote upload auditable and apply-once - a bare
        // endpoint list was the gap this closes.
        Assert.Contains("ticket-secret", json);
        Assert.Contains(AgentUploadTicketFilter.TicketHeader, json);
        tickets.Verify(
            t => t.IssueAsync("key-1", "import-model", "Model", null, null, It.IsAny<CancellationToken>()),
            Times.Once);
        // The control-plane call must not claim the key or import anything: the key is
        // claimed when the upload actually arrives, so asking for a ticket and never using
        // it does not burn it.
        handler.Verify(h => h.Handle(It.IsAny<AddModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ImportModel_Unreadable_Path_Releases_The_Claim()
    {
        var handler = new Mock<ICommandHandler<AddModelCommand, AddModelCommandResponse>>();
        var audit = ClaimGranted();

        var result = await AssetWriteMcpTools.ImportModel(
            handler.Object, audit.Object, Caller(), Tickets().Object, "key-1", path: "/nonexistent/nope.glb");

        Assert.Contains("PathNotFound", Json(result));
        audit.Verify(a => a.AbandonAsync("key-1", It.IsAny<CancellationToken>()), Times.Once);
        handler.Verify(h => h.Handle(It.IsAny<AddModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Token_Without_The_Write_Scope_Is_Refused_Before_The_Key_Is_Claimed()
    {
        // A denied call must not burn the idempotency key: the operator who then widens the
        // token would otherwise find the retry answered "already-applied" for a write that
        // never ran.
        var handler = new Mock<ICommandHandler<CreatePackCommand, CreatePackResponse>>();
        var audit = ClaimGranted();
        var readOnly = McpCallerContext.For(new McpPrincipal("reader", new[] { McpScope.Read }));

        var result = await AssetWriteMcpTools.CreatePack(
            handler.Object, audit.Object, readOnly, "Denied Pack", "key-11");

        Assert.Contains("ScopeRequired", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<CreatePackCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>Ticket issuer returning a fixed secret, so the tool's response can be asserted on.</summary>
    private static Mock<IAgentUploadTickets> Tickets()
    {
        var tickets = new Mock<IAgentUploadTickets>();
        tickets.Setup(t => t.IssueAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((string key, string _, string _, string? _, string? _, CancellationToken _) =>
                new AgentUploadTicketGrant("ticket-secret", key, Now.AddMinutes(30)));
        return tickets;
    }
}
