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
        int modelVersionId,
        string modelHash, 
        int maxAttempts = 3, 
        int lockTimeoutMinutes = 10, 
        CancellationToken cancellationToken = default)
    {
        // Check for ANY existing job for this specific version (regardless of status)
        // We need to check ALL jobs (not just active ones) to avoid duplicate key constraint violations
        // The unique index is on (ModelHash, ModelVersionId) so we must reuse existing jobs
        var existingJob = await _thumbnailJobRepository.GetByModelVersionIdAsync(modelVersionId, cancellationToken);
        
        if (existingJob != null)
        {
            // Reset the existing job to trigger fresh thumbnail generation
            // This is important when regenerating thumbnails or changing default texture sets
            var currentTime = DateTime.UtcNow;
            existingJob.Reset(currentTime);
            await _thumbnailJobRepository.UpdateAsync(existingJob, cancellationToken);
            
            _logger.LogInformation("Reset existing thumbnail job {JobId} (status: {OldStatus}) for model {ModelId} version {ModelVersionId} for regeneration", 
                existingJob.Id, existingJob.Status, modelId, modelVersionId);
            
            // Send real-time notification to workers that a job is available for processing
            await _queueNotificationService.NotifyJobEnqueuedAsync(existingJob, cancellationToken);
            
            return existingJob;
        }

        var job = ThumbnailJob.Create(modelId, modelVersionId, modelHash, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);

        _logger.LogInformation("Enqueued thumbnail job {JobId} for model {ModelId} version {ModelVersionId} with hash {ModelHash}", 
            createdJob.Id, modelId, modelVersionId, modelHash);

        // Send real-time notification to workers that a new job is available
        await _queueNotificationService.NotifyJobEnqueuedAsync(createdJob, cancellationToken);

        return createdJob;
    }

    public async Task<ThumbnailJob> EnqueueSoundWaveformAsync(
        int soundId,
        string soundHash,
        int maxAttempts = 3,
        int lockTimeoutMinutes = 10,
        CancellationToken cancellationToken = default)
    {
        // Check for existing waveform job for this sound hash
        var existingJob = await _thumbnailJobRepository.GetBySoundHashAsync(soundHash, cancellationToken);

        if (existingJob != null)
        {
            // Reset the existing job to trigger fresh waveform generation
            var currentTime = DateTime.UtcNow;
            existingJob.Reset(currentTime);
            await _thumbnailJobRepository.UpdateAsync(existingJob, cancellationToken);

            _logger.LogInformation("Reset existing waveform job {JobId} (status: {OldStatus}) for sound {SoundId} for regeneration",
                existingJob.Id, existingJob.Status, soundId);

            // Send real-time notification to workers
            await _queueNotificationService.NotifyJobEnqueuedAsync(existingJob, cancellationToken);

            return existingJob;
        }

        var job = ThumbnailJob.CreateForSound(soundId, soundHash, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);

        _logger.LogInformation("Enqueued waveform thumbnail job {JobId} for sound {SoundId} with hash {SoundHash}",
            createdJob.Id, soundId, soundHash);

        // Send real-time notification to workers
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

        _logger.LogInformation("Worker {WorkerId} claimed thumbnail job {JobId} for model {ModelId} version {ModelVersionId} (attempt {AttemptCount})", 
            workerId, job.Id, job.ModelId, job.ModelVersionId, job.AttemptCount);

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

        _logger.LogInformation("Marked thumbnail job {JobId} as completed for model {ModelId} version {ModelVersionId}", 
            jobId, job.ModelId, job.ModelVersionId);
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
            _logger.LogWarning("Thumbnail job {JobId} for model {ModelId} version {ModelVersionId} moved to dead letter queue after {AttemptCount} attempts. Error: {ErrorMessage}", 
                jobId, job.ModelId, job.ModelVersionId, job.AttemptCount, errorMessage);
        }
        else
        {
            _logger.LogInformation("Thumbnail job {JobId} for model {ModelId} version {ModelVersionId} failed (attempt {AttemptCount}), will retry. Error: {ErrorMessage}", 
                jobId, job.ModelId, job.ModelVersionId, job.AttemptCount, errorMessage);
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

        _logger.LogInformation("Reset thumbnail job {JobId} for manual retry for model {ModelId} version {ModelVersionId}", 
            jobId, job.ModelId, job.ModelVersionId);

        // Send real-time notification to workers that a job is available for processing
        await _queueNotificationService.NotifyJobEnqueuedAsync(job, cancellationToken);
    }

    public async Task<ThumbnailJob?> GetJobAsync(int jobId, CancellationToken cancellationToken = default)
    {
        return await _thumbnailJobRepository.GetByIdAsync(jobId, cancellationToken);
    }

    public async Task<ThumbnailJob?> GetJobByModelHashAsync(string modelHash, CancellationToken cancellationToken = default)
    {
        return await _thumbnailJobRepository.GetByModelHashAsync(modelHash, cancellationToken);
    }

    public async Task<int> CancelActiveJobsForModelAsync(int modelId, CancellationToken cancellationToken = default)
    {
        var activeJobs = await _thumbnailJobRepository.GetActiveJobsByModelIdAsync(modelId, cancellationToken);
        var cancelledCount = 0;
        var currentTime = DateTime.UtcNow;

        foreach (var job in activeJobs)
        {
            try
            {
                job.Cancel(currentTime);
                await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);
                cancelledCount++;

                _logger.LogInformation("Cancelled thumbnail job {JobId} for model {ModelId} due to configuration change", 
                    job.Id, modelId);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Failed to cancel thumbnail job {JobId} for model {ModelId}", 
                    job.Id, modelId);
            }
        }

        if (cancelledCount > 0)
        {
            _logger.LogInformation("Cancelled {CancelledCount} active thumbnail job(s) for model {ModelId}", 
                cancelledCount, modelId);
        }

        return cancelledCount;
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