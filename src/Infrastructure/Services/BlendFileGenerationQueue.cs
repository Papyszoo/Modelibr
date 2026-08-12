using System.Threading.Channels;
using Application.Abstractions.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

/// <summary>
/// Bounded in-process background queue that (re)generates the cached
/// generated-{name}.blend WebDAV file for a model version - see
/// <see cref="IBlendFileGenerationQueue"/> for when callers enqueue.
///
/// Modeled on the thumbnail job queue's enqueue/consume shape but intentionally lighter:
/// generation is a single in-process Blender CLI call via <see cref="IBlendFileGenerator"/>,
/// not distributed work handed to an external worker process, so a Channel + BackgroundService
/// is enough - no DB-backed job table or dequeue/claim protocol needed.
///
/// Registered as a singleton against BOTH <see cref="IBlendFileGenerationQueue"/> and
/// <see cref="IHostedService"/> (see Infrastructure/DependencyInjection.cs) so the producer
/// (Enqueue, called from request-handling code) and the consumer (ExecuteAsync, running on
/// the host's background service lifetime) share the same channel instance.
/// </summary>
public sealed class BlendFileGenerationQueue : BackgroundService, IBlendFileGenerationQueue
{
    // Small bound: this only ever holds recently-touched (modelId, versionId) pairs from
    // attach/invalidate events. A burst larger than this almost certainly means duplicate
    // churn on the same handful of versions, so dropping the oldest is safe - the GET-time
    // fallback in GetOrGenerateAsync covers anything that gets dropped.
    private const int Capacity = 64;

    private readonly Channel<(int ModelId, int VersionId)> _channel = Channel.CreateBounded<(int ModelId, int VersionId)>(
        new BoundedChannelOptions(Capacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });

    private readonly IBlendFileGenerator _generator;
    private readonly ILogger<BlendFileGenerationQueue> _logger;

    public BlendFileGenerationQueue(IBlendFileGenerator generator, ILogger<BlendFileGenerationQueue> logger)
    {
        _generator = generator;
        _logger = logger;
    }

    public void Enqueue(int modelId, int versionId)
    {
        // Skip silently - no Blender install means GetOrGenerateAsync would return null
        // anyway, and callers (request handlers) must never be slowed or failed by this.
        if (!_generator.IsAvailable)
            return;

        if (!_channel.Writer.TryWrite((modelId, versionId)))
        {
            _logger.LogDebug(
                "Blend generation queue full; dropped background request for model {ModelId} version {VersionId} (GET-time fallback still applies)",
                modelId, versionId);
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var (modelId, versionId) in _channel.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    var result = await _generator.GetOrGenerateAsync(modelId, versionId, stoppingToken);
                    if (result == null)
                    {
                        _logger.LogDebug(
                            "Background .blend generation produced nothing for model {ModelId} version {VersionId} (no renderable file yet, or Blender unavailable)",
                            modelId, versionId);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // Never let one failed generation take down the consumer loop - the
                    // GET-time fallback will retry on next access regardless.
                    _logger.LogWarning(ex,
                        "Background .blend generation failed for model {ModelId} version {VersionId}; the GET-time fallback will retry on next access",
                        modelId, versionId);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }
}
