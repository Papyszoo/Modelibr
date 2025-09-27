using Domain.Models;

namespace Application.Abstractions.Services;

/// <summary>
/// Abstraction for sending thumbnail job queue notifications to workers.
/// </summary>
public interface IThumbnailJobQueueNotificationService
{
    /// <summary>
    /// Notifies workers that a new thumbnail job is available for processing.
    /// </summary>
    /// <param name="job">The thumbnail job that was enqueued</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task NotifyJobEnqueuedAsync(ThumbnailJob job, CancellationToken cancellationToken = default);

    /// <summary>
    /// Notifies workers about job status updates (for worker coordination).
    /// </summary>
    /// <param name="jobId">The job ID</param>
    /// <param name="status">The job status</param>
    /// <param name="workerId">The worker ID processing the job (if applicable)</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task NotifyJobStatusChangedAsync(int jobId, string status, string? workerId = null, CancellationToken cancellationToken = default);
}