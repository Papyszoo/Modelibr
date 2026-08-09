using Application.Abstractions;
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
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly AgentAudit _audit;

    public AgentAuditTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);
        _audit = new AgentAudit(_repo.Object, clock.Object, _uow.Object);
    }

    [Fact]
    public async Task FindAsync_Returns_Prior_Entry_For_Key()
    {
        var prior = AgentOperationLog.Create("key-1", "set-category", Now, assetType: "Model", assetId: 3);
        _repo.Setup(r => r.GetByIdempotencyKeyAsync("key-1", It.IsAny<CancellationToken>())).ReturnsAsync(prior);

        var found = await _audit.FindAsync("key-1");

        Assert.Same(prior, found);
    }

    [Fact]
    public async Task RecordAsync_Adds_Log_And_Commits()
    {
        AgentOperationLog? captured = null;
        _repo.Setup(r => r.AddAsync(It.IsAny<AgentOperationLog>(), It.IsAny<CancellationToken>()))
            .Callback<AgentOperationLog, CancellationToken>((log, _) => captured = log)
            .Returns(Task.CompletedTask);

        await _audit.RecordAsync(new AgentWrite(
            "key-2", "set-tags", "Model", 7, PayloadAfter: "{\"tags\":[\"pbr\"]}"));

        Assert.NotNull(captured);
        Assert.Equal("key-2", captured!.IdempotencyKey);
        Assert.Equal("set-tags", captured.Operation);
        Assert.Equal("Model", captured.AssetType);
        Assert.Equal(7, captured.AssetId);
        Assert.Equal(Now, captured.PerformedAt);
        _uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }
}
