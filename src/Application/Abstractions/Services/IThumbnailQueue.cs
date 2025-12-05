using Domain.Models;

namespace Application.Abstractions.Services;

/// <summary>
/// Abstraction for thumbnail generation queue operations.
/// Provides safe job claiming for concurrent workers and dead letter handling.
/// </summary>
public interface IThumbnailQueue
{
    /// <summary>
    /// Enqueues a new thumbnail generation job for the given model version.
    /// Prevents duplicate jobs for the same model hash.
    /// </summary>
    /// <param name="modelId">The model ID</param>
    /// <param name="modelVersionId">The model version ID</param>
    /// <param name="modelHash">The SHA256 hash of the model for deduplication</param>
    /// <param name="maxAttempts">Maximum retry attempts (default: 3)</param>
    /// <param name="lockTimeoutMinutes">Lock timeout in minutes (default: 10)</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>The created job or existing job if already exists</returns>
    Task<ThumbnailJob> EnqueueAsync(int modelId, int modelVersionId, string modelHash, int maxAttempts = 3, int lockTimeoutMinutes = 10, CancellationToken cancellationToken = default);

    /// <summary>
    /// Attempts to dequeue and claim the next pending job for processing.
    /// Includes automatic retry of jobs with expired locks.
    /// </summary>
    /// <param name="workerId">Unique identifier for the worker claiming the job</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>The claimed job or null if no jobs available</returns>
    Task<ThumbnailJob?> DequeueAsync(string workerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks a job as completed successfully.
    /// </summary>
    /// <param name="jobId">The job ID</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task MarkCompletedAsync(int jobId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks a job as failed. Automatically handles retry logic and dead letter queue.
    /// </summary>
    /// <param name="jobId">The job ID</param>
    /// <param name="errorMessage">The error that caused the failure</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task MarkFailedAsync(int jobId, string errorMessage, CancellationToken cancellationToken = default);

    /// <summary>
    /// Resets a failed or dead job for manual retry (admin function).
    /// </summary>
    /// <param name="jobId">The job ID</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task RetryJobAsync(int jobId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets the current status of a job.
    /// </summary>
    /// <param name="jobId">The job ID</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>The job or null if not found</returns>
    Task<ThumbnailJob?> GetJobAsync(int jobId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a job by model hash to check for duplicates.
    /// </summary>
    /// <param name="modelHash">The model hash</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>The job or null if not found</returns>
    Task<ThumbnailJob?> GetJobByModelHashAsync(string modelHash, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cancels all active (pending or processing) thumbnail jobs for a specific model.
    /// Used when model configuration changes require new thumbnail generation.
    /// </summary>
    /// <param name="modelId">The model ID</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Number of jobs cancelled</returns>
    Task<int> CancelActiveJobsForModelAsync(int modelId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cleans up expired locks and resets them to pending status.
    /// This method should be called periodically by a background service.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Number of jobs that had their locks cleaned up</returns>
    Task<int> CleanupExpiredLocksAsync(CancellationToken cancellationToken = default);
}