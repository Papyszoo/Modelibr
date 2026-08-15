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
            .ReturnsAsync((AgentOperationLog?)null);

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
            .ReturnsAsync(winner);

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
            .ReturnsAsync(inFlight);

        var claim = await _audit.TryBeginAsync(new AgentWrite("key-9", "create-pack", "Pack"));

        Assert.Equal(AgentClaimOutcome.InProgress, claim.Outcome);
        Assert.Same(inFlight, claim.Entry);
    }

    [Fact]
    public async Task CompleteAsync_Records_The_Outcome_On_The_Claim()
    {
        await _audit.CompleteAsync("key-3", "Model", 9, "{\"tags\":[\"pbr\"]}", "{\"tags\":[\"wood\"]}");

        _repo.Verify(
            r => r.CompleteClaimAsync(
                "key-3", "Model", 9, "{\"tags\":[\"pbr\"]}", "{\"tags\":[\"wood\"]}", Now, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task AbandonAsync_Fails_The_Claim_So_A_Failed_Write_Can_Be_Retried()
    {
        await _audit.AbandonAsync("key-4");

        _repo.Verify(r => r.FailClaimAsync("key-4", Now, It.IsAny<CancellationToken>()), Times.Once);
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
