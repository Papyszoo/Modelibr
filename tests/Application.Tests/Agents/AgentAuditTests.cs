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
        _repo.Setup(r => r.TryClaimAsync(It.IsAny<AgentOperationLog>(), It.IsAny<CancellationToken>()))
            .Callback<AgentOperationLog, CancellationToken>((log, _) => claimed = log)
            .ReturnsAsync((AgentOperationLog?)null);

        var prior = await _audit.TryBeginAsync(new AgentWrite("key-2", "set-tags", "Model", 7));

        Assert.Null(prior);
        Assert.NotNull(claimed);
        Assert.Equal("key-2", claimed!.IdempotencyKey);
        Assert.Equal("set-tags", claimed.Operation);
        Assert.Equal("Model", claimed.AssetType);
        Assert.Equal(7, claimed.AssetId);
        Assert.Equal(Now, claimed.PerformedAt);
    }

    [Fact]
    public async Task TryBeginAsync_Returns_The_Winning_Entry_When_The_Key_Is_Already_Claimed()
    {
        // The claim insert losing to a concurrent caller is the whole point of the
        // primitive: the loser must be told to stand down, not apply its write.
        var winner = AgentOperationLog.Create("key-1", "set-category", Now, assetType: "Model", assetId: 3);
        _repo.Setup(r => r.TryClaimAsync(It.IsAny<AgentOperationLog>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(winner);

        var prior = await _audit.TryBeginAsync(new AgentWrite("key-1", "set-category", "Model", 3));

        Assert.Same(winner, prior);
    }

    [Fact]
    public async Task CompleteAsync_Records_The_Outcome_On_The_Claim()
    {
        await _audit.CompleteAsync("key-3", "Model", 9, "{\"tags\":[\"pbr\"]}");

        _repo.Verify(
            r => r.CompleteClaimAsync("key-3", "Model", 9, "{\"tags\":[\"pbr\"]}", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task AbandonAsync_Releases_The_Claim_So_A_Failed_Write_Can_Be_Retried()
    {
        await _audit.AbandonAsync("key-4");

        _repo.Verify(r => r.ReleaseClaimAsync("key-4", It.IsAny<CancellationToken>()), Times.Once);
    }
}
