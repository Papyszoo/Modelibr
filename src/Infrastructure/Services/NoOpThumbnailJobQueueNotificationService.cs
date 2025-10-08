using Application.Abstractions.Services;
using Domain.Models;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

/// <summary>
/// No-op implementation of thumbnail job queue notification service.
/// Use this when polling-based queue is preferred over push notifications.
/// </summary>
public class NoOpThumbnailJobQueueNotificationService : IThumbnailJobQueueNotificationService
{
    private readonly ILogger<NoOpThumbnailJobQueueNotificationService> _logger;

    public NoOpThumbnailJobQueueNotificationService(ILogger<NoOpThumbnailJobQueueNotificationService> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task NotifyJobEnqueuedAsync(ThumbnailJob job, CancellationToken cancellationToken = default)
    {
        // No-op: Workers use polling instead of push notifications
        _logger.LogDebug("Skipping job enqueued notification for job {JobId} (using polling-based queue)", job.Id);
        return Task.CompletedTask;
    }

    public Task NotifyJobStatusChangedAsync(int jobId, string status, string? workerId = null, CancellationToken cancellationToken = default)
    {
        // No-op: Workers use polling instead of push notifications
        _logger.LogDebug("Skipping job status changed notification for job {JobId} (using polling-based queue)", jobId);
        return Task.CompletedTask;
    }
}
