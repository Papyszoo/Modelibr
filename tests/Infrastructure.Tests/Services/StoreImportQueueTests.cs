using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.StoreImports;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// Covers StoreImportQueue - the bounded Channel + BackgroundService consuming store import
/// jobs. The queue is in-memory, so its startup sweep must fail Pending/Running job rows
/// orphaned by a previous shutdown (no worker will ever resume them).
/// </summary>
public class StoreImportQueueTests
{
    [Fact]
    public async Task Startup_FailsJobsOrphanedByPreviousShutdown()
    {
        var now = new DateTime(2026, 7, 16, 0, 0, 0, DateTimeKind.Utc);
        var orphan = StoreImportJob.Create("https://store.example.com", "asset-1", now);
        orphan.MarkRunning(now);

        var jobRepo = new Mock<IStoreImportJobRepository>();
        var swept = new TaskCompletionSource();
        jobRepo.Setup(r => r.GetUnfinishedAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { orphan });
        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask)
            .Callback(() => swept.TrySetResult());
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(now);

        var services = new ServiceCollection();
        services.AddScoped(_ => jobRepo.Object);
        services.AddScoped(_ => unitOfWork.Object);
        services.AddScoped(_ => clock.Object);
        services.AddScoped(_ => new Mock<IStoreImportProcessor>().Object);
        using var provider = services.BuildServiceProvider();

        var queue = new StoreImportQueue(
            provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<StoreImportQueue>.Instance);

        await queue.StartAsync(CancellationToken.None);
        try
        {
            var completed = await Task.WhenAny(swept.Task, Task.Delay(TimeSpan.FromSeconds(5)));
            Assert.Same(swept.Task, completed);
        }
        finally
        {
            await queue.StopAsync(CancellationToken.None);
        }

        Assert.Equal(StoreImportJobStatus.Failed, orphan.Status);
        Assert.Contains("restart", orphan.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        jobRepo.Verify(r => r.UpdateAsync(orphan, It.IsAny<CancellationToken>()), Times.Once);
    }
}
