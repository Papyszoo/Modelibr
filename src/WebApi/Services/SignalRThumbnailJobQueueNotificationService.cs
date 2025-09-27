using Application.Abstractions.Services;
using Domain.Models;
using Microsoft.AspNetCore.SignalR;
using WebApi.Hubs;

namespace WebApi.Services;

/// <summary>
/// SignalR implementation of thumbnail job queue notification service.
/// Sends real-time notifications to workers when jobs are available.
/// </summary>
public class SignalRThumbnailJobQueueNotificationService : IThumbnailJobQueueNotificationService
{
    private readonly IHubContext<ThumbnailJobHub> _hubContext;
    private readonly ILogger<SignalRThumbnailJobQueueNotificationService> _logger;

    public SignalRThumbnailJobQueueNotificationService(
        IHubContext<ThumbnailJobHub> hubContext,
        ILogger<SignalRThumbnailJobQueueNotificationService> logger)
    {
        _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task NotifyJobEnqueuedAsync(ThumbnailJob job, CancellationToken cancellationToken = default)
    {
        try
        {
            var groupName = ThumbnailJobHub.GetWorkersGroupName();
            
            // Create the job notification payload
            var notification = new
            {
                JobId = job.Id,
                ModelId = job.ModelId,
                ModelHash = job.ModelHash,
                Status = job.Status.ToString(),
                AttemptCount = job.AttemptCount,
                CreatedAt = job.CreatedAt,
                Timestamp = DateTime.UtcNow
            };

            // Send notification to all registered workers
            await _hubContext.Clients.Group(groupName)
                .SendAsync("JobEnqueued", notification, cancellationToken);

            _logger.LogDebug("Sent job enqueued notification for job {JobId} to {GroupName}", 
                job.Id, groupName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send job enqueued notification for job {JobId}", job.Id);
            // Don't throw - notification failure shouldn't break the enqueue process
        }
    }

    public async Task NotifyJobStatusChangedAsync(int jobId, string status, string? workerId = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var groupName = ThumbnailJobHub.GetWorkersGroupName();
            
            // Create the status change notification payload
            var notification = new
            {
                JobId = jobId,
                Status = status,
                WorkerId = workerId,
                Timestamp = DateTime.UtcNow
            };

            // Send notification to all registered workers for coordination
            await _hubContext.Clients.Group(groupName)
                .SendAsync("JobStatusChanged", notification, cancellationToken);

            _logger.LogDebug("Sent job status changed notification for job {JobId} (status: {Status}, worker: {WorkerId})", 
                jobId, status, workerId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send job status changed notification for job {JobId}", jobId);
            // Don't throw - notification failure shouldn't break the status update process
        }
    }
}