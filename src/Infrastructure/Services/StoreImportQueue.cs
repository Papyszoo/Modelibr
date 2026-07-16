using System.Threading.Channels;
using Application.Abstractions.Services;
using Application.StoreImports;
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
}
