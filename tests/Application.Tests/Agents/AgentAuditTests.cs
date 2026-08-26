using Application.Abstractions.Repositories;
using Application.Agents;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Agents;

public class AgentAuditTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IAgentOperationLogRepository> _repo = new();
    private readonly AgentAudit _audit;

    public AgentAuditTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);
        _audit = new AgentAudit(_repo.Object, clock.Object);
    }

    [Fact]
    public async Task TryBeginAsync_Claims_The_Key_Before_The_Write_Runs()
    {
        AgentOperationLog? claimed = null;
        _repo.Setup(r => r.TryClaimAsync(
                It.IsAny<AgentOperationLog>(), It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .Callback<AgentOperationLog, int, DateTime, CancellationToken>((log, _, _, _) => claimed = log)
            .ReturnsAsync(new ClaimTakeover(Owned: true, ClaimToken: "gen-1"));

        var claim = await _audit.TryBeginAsync(new AgentWrite("key-2", "set-tags", "Model", 7));

        Assert.Equal(AgentClaimOutcome.Owned, claim.Outcome);
        Assert.True(claim.IsOwned);
        Assert.NotNull(claimed);
        Assert.Equal("key-2", claimed!.IdempotencyKey);
        Assert.Equal("set-tags", claimed.Operation);
        Assert.Equal("Model", claimed.AssetType);
        Assert.Equal(7, claimed.AssetId);
        Assert.Equal(Now, claimed.PerformedAt);
        // A fresh claim starts Pending: nothing has been applied yet.
        Assert.Equal(AgentOperationStatus.Pending, claimed.Status);
    }

    [Fact]
    public async Task TryBeginAsync_Reports_AlreadyApplied_Only_For_A_Completed_Entry()
    {
        // The claim insert losing to a concurrent caller is the whole point of the
        // primitive: the loser must be told to stand down, not apply its write.
        var winner = AgentOperationLog.Create("key-1", "set-category", Now, assetType: "Model", assetId: 3);
        winner.MarkCompleted(Now, "Model", 3, "{}");
        _repo.Setup(r => r.TryClaimAsync(
                It.IsAny<AgentOperationLog>(), It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ClaimTakeover(Owned: false, Existing: winner));

        var claim = await _audit.TryBeginAsync(new AgentWrite("key-1", "set-category", "Model", 3));

        Assert.Equal(AgentClaimOutcome.AlreadyApplied, claim.Outcome);
        Assert.Same(winner, claim.Entry);
    }

    [Fact]
    public async Task TryBeginAsync_Reports_InProgress_For_A_Live_Pending_Claim()
    {
        // Regression: the claim is written BEFORE the mutation, so a Pending row means
        // "someone started", never "it was applied". Reporting already-applied here told
        // a retrying agent its write had landed when it may never have run at all.
        var inFlight = AgentOperationLog.Create("key-9", "create-pack", Now, assetType: "Pack");
        _repo.Setup(r => r.TryClaimAsync(
                It.IsAny<AgentOperationLog>(), It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ClaimTakeover(Owned: false, Existing: inFlight));

        var claim = await _audit.TryBeginAsync(new AgentWrite("key-9", "create-pack", "Pack"));

        Assert.Equal(AgentClaimOutcome.InProgress, claim.Outcome);
        Assert.Same(inFlight, claim.Entry);
    }

    [Fact]
    public async Task TryBeginAsync_Reports_Interrupted_When_A_Claim_Died_Mid_Write()
    {
        // The mutation commits before the entry is marked Completed, so a claim whose
        // owner died in that window may have applied everything and recorded nothing.
        // Handing the key to a retry as though it were fresh is how one crash becomes two
        // packs, so the call that finds it is told instead.
        var abandoned = AgentOperationLog.Create("key-10", "create-pack", Now, assetType: "Pack");
        _repo.Setup(r => r.TryClaimAsync(
                It.IsAny<AgentOperationLog>(), It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ClaimTakeover(Owned: false, Existing: abandoned, Interrupted: true));

        var claim = await _audit.TryBeginAsync(new AgentWrite("key-10", "create-pack", "Pack"));

        Assert.Equal(AgentClaimOutcome.Interrupted, claim.Outcome);
        Assert.False(claim.IsOwned);
        Assert.Same(abandoned, claim.Entry);
    }

    [Fact]
    public async Task TryBeginAsync_Hands_The_Owner_The_Generation_It_Must_Settle_With()
    {
        _repo.Setup(r => r.TryClaimAsync(
                It.IsAny<AgentOperationLog>(), It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ClaimTakeover(Owned: true, ClaimToken: "gen-7"));

        var claim = await _audit.TryBeginAsync(new AgentWrite("key-12", "create-pack", "Pack"));

        Assert.True(claim.IsOwned);
        Assert.Equal("gen-7", claim.ClaimToken);
    }

    [Fact]
    public async Task ReleaseReversalAsync_Gives_Back_A_Claim_Whose_Inverse_Failed()
    {
        await _audit.ReleaseReversalAsync("key-11", "rev-1");

        _repo.Verify(
            r => r.ReleaseReversalAsync("key-11", "rev-1", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CompleteAsync_Records_The_Outcome_On_The_Claim()
    {
        await _audit.CompleteAsync("key-3", "gen-1", "Model", 9, "{\"tags\":[\"pbr\"]}", "{\"tags\":[\"wood\"]}");

        _repo.Verify(
            r => r.CompleteClaimAsync(
                "key-3", "gen-1", "Model", 9, "{\"tags\":[\"pbr\"]}", "{\"tags\":[\"wood\"]}", Now,
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task AbandonAsync_Fails_The_Claim_So_A_Failed_Write_Can_Be_Retried()
    {
        await _audit.AbandonAsync("key-4", "gen-1");

        _repo.Verify(
            r => r.FailClaimAsync("key-4", "gen-1", Now, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void Reclaiming_A_Row_Moves_It_To_A_New_Generation()
    {
        // What stops the previous owner from settling the claim that replaced its own: the
        // token it is holding is no longer the one on the row.
        var claim = AgentOperationLog.Create("key-13", "create-pack", Now);
        var first = claim.ClaimToken;

        claim.MarkFailed(Now.AddMinutes(1));
        claim.Reclaim("other-host", Now.AddMinutes(2), actor: "someone-else");

        Assert.NotEqual(first, claim.ClaimToken);
        Assert.NotEmpty(claim.ClaimToken);
    }

    [Fact]
    public void An_Interrupted_Claim_Is_Terminal_And_Not_The_Same_As_Failed()
    {
        // Failed is written by a path that knows nothing landed. Interrupted is written by
        // the lease sweep, which knows nothing at all - so it must not be retryable.
        var claim = AgentOperationLog.Create("key-14", "create-pack", Now);

        claim.MarkInterrupted(Now.AddMinutes(20));

        Assert.Equal(AgentOperationStatus.Interrupted, claim.Status);
        Assert.NotEqual(AgentOperationStatus.Failed, claim.Status);
        Assert.Null(claim.ClaimedBy);
        // And it no longer looks like an abandoned Pending claim to anybody sweeping.
        Assert.False(claim.IsClaimAbandoned(Now.AddHours(24), leaseMinutes: 15));
    }

    [Fact]
    public void A_Reversal_Claim_Is_Abandoned_Only_Once_Its_Own_Lease_Expires()
    {
        var claim = AgentOperationLog.Create("key-15", "delete-scene", Now);
        claim.MarkCompleted(Now, "Scene", 4, "{}");

        Assert.False(claim.IsReversalAbandoned(Now.AddHours(1), leaseMinutes: 5));

        claim.BeginReversal("rev-1", Now);
        Assert.False(claim.IsReversalAbandoned(Now.AddMinutes(1), leaseMinutes: 5));
        Assert.True(claim.IsReversalAbandoned(Now.AddMinutes(5), leaseMinutes: 5));

        // Once the inverse actually landed there is nothing left to be ambiguous about.
        claim.MarkReversed(Now.AddMinutes(1));
        Assert.False(claim.IsReversalAbandoned(Now.AddHours(24), leaseMinutes: 5));
    }

    [Fact]
    public void A_Pending_Claim_Is_Abandoned_Once_Its_Lease_Expires()
    {
        // What lets a retry recover a key whose owner crashed between claim and mutation.
        var claim = AgentOperationLog.Create("key-5", "import-model", Now);

        Assert.False(claim.IsClaimAbandoned(Now.AddMinutes(5), leaseMinutes: 15));
        Assert.True(claim.IsClaimAbandoned(Now.AddMinutes(15), leaseMinutes: 15));

        // A completed operation is never "abandoned" - it is the durable result.
        claim.MarkCompleted(Now, "Model", 1, "{}");
        Assert.False(claim.IsClaimAbandoned(Now.AddHours(24), leaseMinutes: 15));
    }
}
