using System.Text.Json;
using Application.Agents;
using Domain.Models;
using Moq;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// How <see cref="McpWriteGuard.Guarded"/> settles a claim on each way out.
///
/// <para>
/// There is exactly one question behind every test here: <b>did this exit path know the
/// mutation had not happened?</b> Only a returned failure does - the tool declined before
/// touching anything - and only that one may release the key for a retry. A throw, a
/// cancellation, or a completion that itself fails all land in the window between "the
/// command committed" and "the entry says so", where nothing knows which side it is on.
/// Those must burn the key into the terminal Interrupted state instead.
/// </para>
///
/// <para>
/// The regression: all of them shared one catch, so an exception raised <i>after</i> a
/// committed mutation released the key as Failed and the next retry re-applied it. For
/// <c>create_pack</c> and <c>create_scene</c> that is not a no-op, it is two of them.
/// </para>
/// </summary>
public class McpWriteGuardTests
{
    private const string Key = "key-1";
    private const string Token = "gen-1";

    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    private static AgentWrite Write() => new(Key, "create-pack");

    private static string Json(object value) => JsonSerializer.Serialize(value);

    /// <summary>An audit that grants the claim and accepts every settle.</summary>
    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, Token));
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.AbandonAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.InterruptAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    private static void VerifyNeverAbandoned(Mock<IAgentAudit> audit) =>
        audit.Verify(a => a.AbandonAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);

    [Fact]
    public async Task A_Mutation_That_Committed_Before_Completion_Threw_Interrupts_The_Key()
    {
        // The exact reported hole: the command committed, CompleteAsync blew up, and the
        // catch released the key - so the same key could run the whole write again.
        var audit = ClaimGranted();
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("the connection dropped"));

        var result = await McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            _ => Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 7, new { })),
            CancellationToken.None);

        // The key is ambiguous, and it says so - carrying what the lost call was working on,
        // which is the only thing a person recovering by hand has to go on.
        audit.Verify(a => a.InterruptAsync(Key, Token, "Pack", 7, It.IsAny<CancellationToken>()), Times.Once);
        VerifyNeverAbandoned(audit);

        var json = Json(result);
        Assert.Contains("\"interrupted\"", json);
        Assert.Contains("NEW idempotency key", json);
    }

    [Fact]
    public async Task A_Body_That_Throws_After_Committing_Interrupts_Rather_Than_Releasing_The_Key()
    {
        // A body can commit and still throw: an after-commit dispatch, a projection update,
        // a serialization of the response. Nothing here can tell that from a body that threw
        // before it wrote, so the honest answer is "unknown", not "retry me".
        var audit = ClaimGranted();
        var committed = false;

        await Assert.ThrowsAsync<InvalidOperationException>(() => McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            _ =>
            {
                committed = true; // stands in for the command's transaction committing
                throw new InvalidOperationException("after-commit dispatch failed");
            },
            CancellationToken.None));

        Assert.True(committed);
        audit.Verify(a => a.InterruptAsync(Key, Token, null, null, It.IsAny<CancellationToken>()), Times.Once);
        VerifyNeverAbandoned(audit);
    }

    [Fact]
    public async Task A_Cancellation_With_An_Unknown_Commit_Status_Interrupts_The_Key()
    {
        // Cancelling the request does not cancel a transaction that already committed. The
        // old code treated cancellation as proof nothing happened; it is proof of nothing.
        var audit = ClaimGranted();
        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            token =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 7, new { }));
            },
            cancelled.Token));

        audit.Verify(a => a.InterruptAsync(Key, Token, null, null, It.IsAny<CancellationToken>()), Times.Once);
        VerifyNeverAbandoned(audit);
    }

    [Fact]
    public async Task The_Interrupting_Settle_Runs_Even_When_The_Callers_Token_Is_Cancelled()
    {
        // The settle must not be cancelled by the same token that cancelled the call, or the
        // ambiguity never gets recorded and the key stays Pending until its lease.
        var audit = ClaimGranted();
        CancellationToken observed = default;
        audit.Setup(a => a.InterruptAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<CancellationToken>()))
            .Callback<string, string, string?, int?, CancellationToken>((_, _, _, _, t) => observed = t)
            .ReturnsAsync(true);

        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            token =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 7, new { }));
            },
            cancelled.Token));

        Assert.False(observed.CanBeCanceled);
    }

    [Fact]
    public async Task An_Explicit_Returned_Failure_Still_Releases_The_Key_For_A_Retry()
    {
        // The other half, and the reason this is not simply "interrupt everything": a tool
        // that returned an error has not mutated, so its key must stay retryable. Losing
        // this would make every validation error permanently burn its idempotency key.
        var audit = ClaimGranted();

        var result = await McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            _ => Task.FromResult(McpWriteGuard.Failed(new { error = "NotFound" })),
            CancellationToken.None);

        audit.Verify(a => a.AbandonAsync(Key, Token, It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.InterruptAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
            It.IsAny<CancellationToken>()), Times.Never);
        Assert.Contains("NotFound", Json(result));
    }

    [Fact]
    public async Task An_Interrupt_That_Cannot_Be_Recorded_Reports_The_Original_Fault()
    {
        // Belt and braces: if even the settle fails, the row stays Pending and its lease
        // reaches the same terminal state from the other side. What must not happen is this
        // call returning success for a write whose record it could not write.
        var audit = ClaimGranted();
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("the connection dropped"));
        audit.Setup(a => a.InterruptAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("still dropped"));

        await Assert.ThrowsAsync<InvalidOperationException>(() => McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            _ => Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 7, new { })),
            CancellationToken.None));

        VerifyNeverAbandoned(audit);
    }

    [Fact]
    public async Task A_Successful_Write_Is_Completed_And_Not_Interrupted()
    {
        var audit = ClaimGranted();

        var result = await McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            _ => Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 7, new { })),
            CancellationToken.None);

        audit.Verify(a => a.CompleteAsync(
            Key, Token, "Pack", 7, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
        audit.Verify(a => a.InterruptAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
            It.IsAny<CancellationToken>()), Times.Never);
        VerifyNeverAbandoned(audit);
        Assert.Contains("true", Json(result));
    }

    [Fact]
    public async Task A_Key_Already_Interrupted_Answers_Without_Running_The_Body()
    {
        // The retry side of the same guarantee - whatever put the key into this state, no
        // later call re-runs it.
        var entry = AgentOperationLog.Create(Key, "create-pack", DateTime.UtcNow, assetType: "Pack", assetId: 7);
        entry.MarkInterrupted(DateTime.UtcNow);
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Interrupted, entry));
        var ran = false;

        var result = await McpWriteGuard.Guarded(
            audit.Object,
            Caller(),
            Write(),
            _ =>
            {
                ran = true;
                return Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 7, new { }));
            },
            CancellationToken.None);

        Assert.False(ran);
        Assert.Contains("\"interrupted\"", Json(result));
    }

    [Fact]
    public async Task A_Denied_Caller_Never_Claims_The_Key()
    {
        // Preserved behaviour: the scope check precedes the claim, so a denied call does not
        // burn a key the operator will retry once the token is widened.
        var audit = ClaimGranted();

        await McpWriteGuard.Guarded(
            audit.Object,
            McpCallerContext.For(new McpPrincipal("reader", new[] { McpScope.Read })),
            Write(),
            _ => Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 7, new { })),
            CancellationToken.None);

        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
