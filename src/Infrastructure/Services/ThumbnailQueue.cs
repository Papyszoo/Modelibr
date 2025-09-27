using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

/// <summary>
/// Service implementation for thumbnail generation queue operations.
/// Provides safe job claiming for concurrent workers and dead letter handling.
/// </summary>
public class ThumbnailQueue : IThumbnailQueue
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IThumbnailJobQueueNotificationService _queueNotificationService;
    private readonly ILogger<ThumbnailQueue> _logger;

    public ThumbnailQueue(
        IThumbnailJobRepository thumbnailJobRepository,
        IThumbnailJobQueueNotificationService queueNotificationService,
        ILogger<ThumbnailQueue> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _queueNotificationService = queueNotificationService ?? throw new ArgumentNullException(nameof(queueNotificationService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<ThumbnailJob> EnqueueAsync(
        int modelId, 
        string modelHash, 
        int maxAttempts = 3, 
        int lockTimeoutMinutes = 10, 
        CancellationToken cancellationToken = default)
    {
        // Check for existing job with same model hash to prevent duplicates
        var existingJob = await _thumbnailJobRepository.GetByModelHashAsync(modelHash, cancellationToken);
        if (existingJob != null)
        {
            _logger.LogInformation("Thumbnail job already exists for model hash {ModelHash}, returning existing job {JobId}", 
                modelHash, existingJob.Id);
            return existingJob;
        }

        var job = ThumbnailJob.Create(modelId, modelHash, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);

        _logger.LogInformation("Enqueued thumbnail job {JobId} for model {ModelId} with hash {ModelHash}", 
            createdJob.Id, modelId, modelHash);

        // Send real-time notification to workers that a new job is available
        await _queueNotificationService.NotifyJobEnqueuedAsync(createdJob, cancellationToken);

        return createdJob;
    }

    public async Task<ThumbnailJob?> DequeueAsync(string workerId, CancellationToken cancellationToken = default)
    {
        var job = await _thumbnailJobRepository.GetNextPendingJobAsync(cancellationToken);
        if (job == null)
        {
            return null;
        }

        var claimSuccessful = job.TryClaim(workerId, DateTime.UtcNow);
        if (!claimSuccessful)
        {
            _logger.LogWarning("Failed to claim job {JobId} for worker {WorkerId}", job.Id, workerId);
            return null;
        }

        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);

        _logger.LogInformation("Worker {WorkerId} claimed thumbnail job {JobId} for model {ModelId} (attempt {AttemptCount})", 
            workerId, job.Id, job.ModelId, job.AttemptCount);

        // Notify other workers about job status change for coordination
        await _queueNotificationService.NotifyJobStatusChangedAsync(job.Id, job.Status.ToString(), workerId, cancellationToken);

        return job;
    }

    public async Task MarkCompletedAsync(int jobId, CancellationToken cancellationToken = default)
    {
        var job = await _thumbnailJobRepository.GetByIdAsync(jobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Attempted to mark non-existent job {JobId} as completed", jobId);
            return;
        }

        job.MarkAsCompleted(DateTime.UtcNow);
        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);

        _logger.LogInformation("Marked thumbnail job {JobId} as completed for model {ModelId}", 
            jobId, job.ModelId);
    }

    public async Task MarkFailedAsync(int jobId, string errorMessage, CancellationToken cancellationToken = default)
    {
        var job = await _thumbnailJobRepository.GetByIdAsync(jobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Attempted to mark non-existent job {JobId} as failed", jobId);
            return;
        }

        var previousStatus = job.Status;
        job.MarkAsFailed(errorMessage, DateTime.UtcNow);
        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);

        if (job.Status == Domain.ValueObjects.ThumbnailJobStatus.Dead)
        {
            _logger.LogWarning("Thumbnail job {JobId} for model {ModelId} moved to dead letter queue after {AttemptCount} attempts. Error: {ErrorMessage}", 
                jobId, job.ModelId, job.AttemptCount, errorMessage);
        }
        else
        {
            _logger.LogInformation("Thumbnail job {JobId} for model {ModelId} failed (attempt {AttemptCount}), will retry. Error: {ErrorMessage}", 
                jobId, job.ModelId, job.AttemptCount, errorMessage);
        }
    }

    public async Task RetryJobAsync(int jobId, CancellationToken cancellationToken = default)
    {
        var job = await _thumbnailJobRepository.GetByIdAsync(jobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Attempted to retry non-existent job {JobId}", jobId);
            return;
        }

        job.Reset(DateTime.UtcNow);
        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);

        _logger.LogInformation("Reset thumbnail job {JobId} for manual retry for model {ModelId}", 
            jobId, job.ModelId);
    }

    public async Task<ThumbnailJob?> GetJobAsync(int jobId, CancellationToken cancellationToken = default)
    {
        return await _thumbnailJobRepository.GetByIdAsync(jobId, cancellationToken);
    }

    public async Task<ThumbnailJob?> GetJobByModelHashAsync(string modelHash, CancellationToken cancellationToken = default)
    {
        return await _thumbnailJobRepository.GetByModelHashAsync(modelHash, cancellationToken);
    }

    public async Task<int> CleanupExpiredLocksAsync(CancellationToken cancellationToken = default)
    {
        var expiredJobs = await _thumbnailJobRepository.GetJobsWithExpiredLocksAsync(cancellationToken);
        var cleanedUpCount = 0;
        var currentTime = DateTime.UtcNow;

        foreach (var job in expiredJobs)
        {
            if (job.IsLockExpired(currentTime))
            {
                job.Reset(currentTime);
                await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);
                cleanedUpCount++;

                _logger.LogInformation("Cleaned up expired lock for thumbnail job {JobId}, reset to pending status", job.Id);
            }
        }

        if (cleanedUpCount > 0)
        {
            _logger.LogInformation("Cleaned up {CleanedUpCount} expired thumbnail job locks", cleanedUpCount);
        }

        return cleanedUpCount;
    }
}