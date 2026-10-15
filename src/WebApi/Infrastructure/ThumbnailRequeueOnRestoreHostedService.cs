using Application.Abstractions.Messaging;
using Application.Thumbnails;

namespace WebApi.Infrastructure;

/// <summary>
/// Re-queues thumbnails that a restore left without files.
/// </summary>
/// <remarks>
/// <see cref="RestoreOnBootProcessor"/> runs before the host is built, so it cannot
/// use the queue itself. It leaves a marker instead, and this service - running once
/// the container is up and the database has been migrated - consumes it. The re-queue
/// goes through the ordinary thumbnail job queue, so there is no separate restore path
/// for generation to drift away from. It runs on a background task rather than in
/// <c>StartAsync</c> so a large library cannot delay the app from serving.
/// </remarks>
public sealed class ThumbnailRequeueOnRestoreHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ThumbnailRequeueOnRestoreHostedService> _logger;

    public ThumbnailRequeueOnRestoreHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<ThumbnailRequeueOnRestoreHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var restoreRoot = _configuration["RESTORE_STORAGE_PATH"] ?? "/var/lib/modelibr/restore";
        var marker = Path.Combine(restoreRoot, RestoreOnBootProcessor.ThumbnailRequeueMarkerFileName);
        if (!File.Exists(marker)) return;

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var handler = scope.ServiceProvider.GetRequiredService<
                ICommandHandler<RequeueMissingThumbnailsCommand, RequeueMissingThumbnailsResponse>>();

            var result = await handler.Handle(new RequeueMissingThumbnailsCommand(), stoppingToken);

            if (result.IsSuccess)
            {
                _logger.LogInformation(
                    "Re-queued {Count} thumbnail(s) whose files were missing after restore.",
                    result.Value.EnqueuedCount);
                File.Delete(marker);
            }
            else
            {
                _logger.LogWarning(
                    "Post-restore thumbnail re-queue failed: {Code} {Message}. The marker is left " +
                    "in place so the next startup retries.",
                    result.Error.Code,
                    result.Error.Message);
            }
        }
        catch (Exception ex)
        {
            // Never let a re-queue failure stop the app from serving. The marker stays
            // behind, so a later boot tries again once the cause is fixed.
            _logger.LogError(ex, "Post-restore thumbnail re-queue failed; leaving the marker for the next startup.");
        }
    }
}
