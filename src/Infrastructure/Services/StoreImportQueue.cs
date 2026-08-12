using System.Threading.Channels;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.StoreImports;
using Domain.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

/// <summary>
/// Bounded in-process queue + background consumer for store imports (v0.5 prompt 05). Modeled
/// on <see cref="BlendFileGenerationQueue"/> (Channel + BackgroundService) because an import is
/// in-process pull work, not distributed work handed to the external asset-processor. Each work
/// item carries the import token in memory only; it is never persisted or logged. Every job
/// runs in its own DI scope so it gets fresh scoped repositories/handlers and a clean DbContext.
///
/// Registered once as a singleton exposed through both <see cref="IStoreImportQueue"/> (producer)
/// and <see cref="IHostedService"/> (consumer) so enqueue and consume share the same channel.
/// </summary>
public sealed class StoreImportQueue : BackgroundService, IStoreImportQueue
{
    // Imports are user-initiated and infrequent; a full queue rejects (never silently drops a
    // job) so the caller gets a clear "try again" instead of a lost import.
    private const int Capacity = 256;

    private readonly Channel<StoreImportWorkItem> _channel = Channel.CreateBounded<StoreImportWorkItem>(
        new BoundedChannelOptions(Capacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false,
        });

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StoreImportQueue> _logger;

    public StoreImportQueue(IServiceScopeFactory scopeFactory, ILogger<StoreImportQueue> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public bool Enqueue(StoreImportWorkItem workItem) => _channel.Writer.TryWrite(workItem);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await FailOrphanedJobsAsync(stoppingToken);

            await foreach (var work in _channel.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var processor = scope.ServiceProvider.GetRequiredService<IStoreImportProcessor>();
                    await processor.ProcessAsync(work, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // Never let one job take down the consumer loop. Log job id only — never the token.
                    _logger.LogError(ex, "Store import job {JobId} failed in the background consumer", work.JobId);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }

    /// <summary>
    /// The queue is in-memory, so any job still Pending/Running in the database at startup
    /// was interrupted by a restart/crash and no worker will ever resume it. Fail those rows
    /// so a polling UI gets a terminal state instead of an eternal spinner; a fresh import
    /// gap-fills via provenance + SHA dedupe.
    /// </summary>
    private async Task FailOrphanedJobsAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var jobs = scope.ServiceProvider.GetRequiredService<IStoreImportJobRepository>();
            var clock = scope.ServiceProvider.GetRequiredService<IDateTimeProvider>();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var orphaned = await jobs.GetUnfinishedAsync(cancellationToken);
            if (orphaned.Count == 0)
                return;

            foreach (var job in orphaned)
            {
                job.Fail("Interrupted by an application restart. Start the import again — already-imported items are skipped/gap-filled.", clock.UtcNow);
                await jobs.UpdateAsync(job, cancellationToken);
            }

            await unitOfWork.SaveChangesAsync(cancellationToken);
            _logger.LogWarning("Store import: failed {Count} job(s) orphaned by a previous shutdown", orphaned.Count);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // The sweep must never prevent the consumer loop from starting.
            _logger.LogError(ex, "Store import: failed to sweep orphaned jobs at startup");
        }
    }
}
