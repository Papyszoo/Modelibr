using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

/// <summary>
/// Service implementation for thumbnail generation queue operations.
/// Provides safe job claiming for concurrent workers and dead letter handling.
///
/// The queue commits its own writes via IUnitOfWork (unlike command handlers,
/// which commit once at the end): enqueue/complete/fail/retry are durable-queue
/// primitives - a job must be persisted before workers are notified over
/// SignalR, and callers include the domain-event pipeline (ModelUploadedEventHandler)
/// where no command handler exists to commit afterwards.
/// </summary>
public class ThumbnailQueue : IThumbnailQueue
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IThumbnailJobQueueNotificationService _queueNotificationService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPostCommitActions _postCommit;
    private readonly ILogger<ThumbnailQueue> _logger;

    public ThumbnailQueue(
        IThumbnailJobRepository thumbnailJobRepository,
        IThumbnailJobQueueNotificationService queueNotificationService,
        IUnitOfWork unitOfWork,
        IPostCommitActions postCommit,
        ILogger<ThumbnailQueue> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _queueNotificationService = queueNotificationService ?? throw new ArgumentNullException(nameof(queueNotificationService));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _postCommit = postCommit ?? throw new ArgumentNullException(nameof(postCommit));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Commits the staged job row and tells the workers a job is waiting - the notification
    /// strictly after the row they are being sent to look for is visible to them.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Notifying used to be an <c>await</c> straight after this <c>SaveChangesAsync</c>,
    /// which reads as "after the commit" and is not, once the caller has a transaction open:
    /// EF joins this save to it, so nothing is durable until that outer boundary commits, and
    /// the worker is a separate process opening its own connection. <c>bind_texture_set</c>
    /// is exactly that caller.
    /// </para>
    /// <para>
    /// Registering the notification BEFORE the save is what makes both cases right: with no
    /// ambient transaction the unit of work drains immediately after committing (so the
    /// timing is unchanged), and inside one it waits for the transaction that owns it.
    /// </para>
    /// </remarks>
    private async Task SaveAndNotifyAsync(ThumbnailJob job, CancellationToken cancellationToken)
    {
        _postCommit.Enqueue(
            "notify thumbnail workers of an enqueued job",
            ct => _queueNotificationService.NotifyJobEnqueuedAsync(job, ct));

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<ThumbnailJob> EnqueueAsync(
        int modelId,
        int modelVersionId,
        string modelHash, 
        bool forceRegenerate = false,
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
            // Only reset if explicitly requested (e.g., texture/variant change) or if the job is permanently failed
            if (forceRegenerate || existingJob.Status == ThumbnailJobStatus.Dead)
            {
                var currentTime = DateTime.UtcNow;
                existingJob.Reset(currentTime);
                await _thumbnailJobRepository.UpdateAsync(existingJob, cancellationToken);
                await SaveAndNotifyAsync(existingJob, cancellationToken);

                _logger.LogInformation("Reset existing thumbnail job {JobId} (status: {Status}) for model {ModelId} version {ModelVersionId} for regeneration (forceRegenerate: {ForceRegenerate})",
                    existingJob.Id, existingJob.Status, modelId, modelVersionId, forceRegenerate);
            }
            else
            {
                _logger.LogInformation("Skipping reset of existing thumbnail job {JobId} (status: {Status}) for model {ModelId} version {ModelVersionId}", 
                    existingJob.Id, existingJob.Status, modelId, modelVersionId);
            }
            
            return existingJob;
        }

        var job = ThumbnailJob.Create(modelId, modelVersionId, modelHash, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);
        await SaveAndNotifyAsync(createdJob, cancellationToken);

        _logger.LogInformation("Enqueued thumbnail job {JobId} for model {ModelId} version {ModelVersionId} with hash {ModelHash}",
            createdJob.Id, modelId, modelVersionId, modelHash);

        return createdJob;
    }

    public async Task<ThumbnailJob> EnqueueSoundWaveformAsync(
        int soundId,
        string soundHash,
        bool forceRegenerate = false,
        int maxAttempts = 3,
        int lockTimeoutMinutes = 10,
        CancellationToken cancellationToken = default)
    {
        // Check for existing waveform job for this sound hash
        var existingJob = await _thumbnailJobRepository.GetBySoundHashAsync(soundHash, cancellationToken);

        if (existingJob != null)
        {
            if (forceRegenerate || existingJob.Status == ThumbnailJobStatus.Dead)
            {
                var currentTime = DateTime.UtcNow;
                existingJob.Reset(currentTime);
                await _thumbnailJobRepository.UpdateAsync(existingJob, cancellationToken);
                await SaveAndNotifyAsync(existingJob, cancellationToken);

                _logger.LogInformation("Reset existing waveform job {JobId} (status: {Status}) for sound {SoundId} for regeneration (forceRegenerate: {ForceRegenerate})",
                    existingJob.Id, existingJob.Status, soundId, forceRegenerate);
            }
            else
            {
                _logger.LogInformation("Skipping reset of existing waveform job {JobId} (status: {Status}) for sound {SoundId}",
                    existingJob.Id, existingJob.Status, soundId);
            }

            return existingJob;
        }

        var job = ThumbnailJob.CreateForSound(soundId, soundHash, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);
        await SaveAndNotifyAsync(createdJob, cancellationToken);

        _logger.LogInformation("Enqueued waveform thumbnail job {JobId} for sound {SoundId} with hash {SoundHash}",
            createdJob.Id, soundId, soundHash);

        return createdJob;
    }

    public async Task<ThumbnailJob> EnqueueTextureSetThumbnailAsync(
        int textureSetId,
        int? proxySize = null,
        bool forceRegenerate = false,
        int maxAttempts = 3,
        int lockTimeoutMinutes = 10,
        CancellationToken cancellationToken = default)
    {
        // Check for existing job for this texture set
        var existingJob = await _thumbnailJobRepository.GetByTextureSetIdAsync(textureSetId, cancellationToken);

        if (existingJob != null)
        {
            if (forceRegenerate || existingJob.Status == ThumbnailJobStatus.Dead)
            {
                var currentTime = DateTime.UtcNow;
                existingJob.Reset(currentTime);
                await _thumbnailJobRepository.UpdateAsync(existingJob, cancellationToken);
                await SaveAndNotifyAsync(existingJob, cancellationToken);

                _logger.LogInformation("Reset existing texture set thumbnail job {JobId} (status: {Status}) for texture set {TextureSetId} for regeneration (forceRegenerate: {ForceRegenerate})",
                    existingJob.Id, existingJob.Status, textureSetId, forceRegenerate);
            }
            else
            {
                _logger.LogInformation("Skipping reset of existing texture set thumbnail job {JobId} (status: {Status}) for texture set {TextureSetId}",
                    existingJob.Id, existingJob.Status, textureSetId);
            }

            return existingJob;
        }

        var job = ThumbnailJob.CreateForTextureSet(textureSetId, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes, proxySize);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);
        await SaveAndNotifyAsync(createdJob, cancellationToken);

        _logger.LogInformation("Enqueued texture set thumbnail job {JobId} for texture set {TextureSetId}",
            createdJob.Id, textureSetId);

        return createdJob;
    }

    public async Task<ThumbnailJob> EnqueueEnvironmentMapThumbnailAsync(
        int environmentMapId,
        int environmentMapVariantId,
        bool forceRegenerate = false,
        int maxAttempts = 3,
        int lockTimeoutMinutes = 10,
        CancellationToken cancellationToken = default)
    {
        var existingJob = await _thumbnailJobRepository.GetByEnvironmentMapVariantIdAsync(environmentMapVariantId, cancellationToken);

        if (existingJob != null)
        {
            if (forceRegenerate || existingJob.Status == ThumbnailJobStatus.Dead)
            {
                var currentTime = DateTime.UtcNow;
                existingJob.Reset(currentTime);
                await _thumbnailJobRepository.UpdateAsync(existingJob, cancellationToken);
                await SaveAndNotifyAsync(existingJob, cancellationToken);
            }

            return existingJob;
        }

        var job = ThumbnailJob.CreateForEnvironmentMap(environmentMapId, environmentMapVariantId, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);
        await SaveAndNotifyAsync(createdJob, cancellationToken);
        return createdJob;
    }

    public async Task<ThumbnailJob> EnqueueSceneRenderAsync(
        int sceneId,
        string viewpoint,
        int maxAttempts = 3,
        int lockTimeoutMinutes = 10,
        int? sceneRevision = null,
        CancellationToken cancellationToken = default)
    {
        // No existing-job lookup on purpose - see IThumbnailQueue. Every request for a
        // scene render is its own question, so it gets its own job and its own picture.
        var job = ThumbnailJob.CreateForScene(sceneId, viewpoint, DateTime.UtcNow, maxAttempts, lockTimeoutMinutes, sceneRevision);
        var createdJob = await _thumbnailJobRepository.AddAsync(job, cancellationToken);
        await SaveAndNotifyAsync(createdJob, cancellationToken);
        return createdJob;
    }

    public async Task<ThumbnailJob?> DequeueAsync(string workerId, CancellationToken cancellationToken = default)
    {
        var job = await _thumbnailJobRepository.GetNextPendingJobAsync(cancellationToken);
        if (job == null)
        {
            return null;
        }

        // Atomically claim the job so multiple worker processes can't both pick it
        // up. The conditional UPDATE (WHERE Status = Pending) is resolved by the
        // database under row locking: exactly one worker's claim changes the row;
        // any that lose the race affect zero rows and simply poll again.
        var claimedAt = DateTime.UtcNow;
        var claimed = await _thumbnailJobRepository.TryClaimPendingJobAsync(job.Id, workerId, claimedAt, cancellationToken);
        if (!claimed)
        {
            _logger.LogDebug("Worker {WorkerId} lost the claim race for job {JobId}; will poll again", SanitizeForLog(workerId), job.Id);
            return null;
        }

        // Reflect the persisted claim on the entity returned to the worker (the
        // atomic UPDATE bypassed the change tracker, so the in-memory copy would
        // otherwise still look pending). This sets the same fields the UPDATE did.
        job.TryClaim(workerId, claimedAt);

        _logger.LogInformation("Worker {WorkerId} claimed thumbnail job {JobId} for model {ModelId} version {ModelVersionId} (attempt {AttemptCount})",
            SanitizeForLog(workerId), job.Id, job.ModelId, job.ModelVersionId, job.AttemptCount);

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
        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var sanitizedError = (errorMessage ?? string.Empty).ReplaceLineEndings(" ");

        if (job.Status == Domain.ValueObjects.ThumbnailJobStatus.Dead)
        {
            _logger.LogWarning("Thumbnail job {JobId} for model {ModelId} version {ModelVersionId} moved to dead letter queue after {AttemptCount} attempts. Error: {ErrorMessage}", 
                jobId, job.ModelId, job.ModelVersionId, job.AttemptCount, sanitizedError);
        }
        else
        {
            _logger.LogInformation("Thumbnail job {JobId} for model {ModelId} version {ModelVersionId} failed (attempt {AttemptCount}), will retry. Error: {ErrorMessage}", 
                jobId, job.ModelId, job.ModelVersionId, job.AttemptCount, sanitizedError);
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
        await SaveAndNotifyAsync(job, cancellationToken);

        _logger.LogInformation("Reset thumbnail job {JobId} for manual retry for model {ModelId} version {ModelVersionId}",
            jobId, job.ModelId, job.ModelVersionId);
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
                await _unitOfWork.SaveChangesAsync(cancellationToken);
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
                await _unitOfWork.SaveChangesAsync(cancellationToken);
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

    // Neutralize CR/LF/TAB in worker-supplied values before logging so a crafted
    // worker id can't forge fake log lines (CodeQL cs/log-forging).
    private static string SanitizeForLog(string? input) =>
        input?.Replace("\n", "").Replace("\r", "").Replace("\t", "") ?? string.Empty;
}
