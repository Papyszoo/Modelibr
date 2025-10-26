using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Represents a thumbnail generation job in the queue with support for locking, 
/// retry attempts, and dead letter handling for concurrent processing.
/// </summary>
public class ThumbnailJob
{
    public int Id { get; set; }
    
    /// <summary>
    /// The ID of the model this thumbnail job is for.
    /// </summary>
    public int ModelId { get; private set; }
    
    /// <summary>
    /// The ID of the model version this thumbnail job is for.
    /// </summary>
    public int ModelVersionId { get; private set; }
    
    /// <summary>
    /// The SHA256 hash of the model for deduplication.
    /// </summary>
    public string ModelHash { get; private set; } = string.Empty;
    
    /// <summary>
    /// Current status of the thumbnail job.
    /// </summary>
    public ThumbnailJobStatus Status { get; private set; } = ThumbnailJobStatus.Pending;
    
    /// <summary>
    /// Number of processing attempts made for this job.
    /// </summary>
    public int AttemptCount { get; private set; } = 0;
    
    /// <summary>
    /// Maximum number of attempts allowed before moving to dead letter queue.
    /// </summary>
    public int MaxAttempts { get; private set; } = 3;
    
    /// <summary>
    /// Error message from the last failed attempt.
    /// </summary>
    public string? ErrorMessage { get; private set; }
    
    /// <summary>
    /// ID of the worker currently processing this job (for locking).
    /// </summary>
    public string? LockedBy { get; private set; }
    
    /// <summary>
    /// When the job was locked for processing.
    /// </summary>
    public DateTime? LockedAt { get; private set; }
    
    /// <summary>
    /// Lock timeout duration in minutes.
    /// </summary>
    public int LockTimeoutMinutes { get; private set; } = 10;
    
    /// <summary>
    /// When the job was created.
    /// </summary>
    public DateTime CreatedAt { get; private set; }
    
    /// <summary>
    /// When the job was last updated.
    /// </summary>
    public DateTime UpdatedAt { get; private set; }
    
    /// <summary>
    /// When the job was completed (successfully or moved to dead letter).
    /// </summary>
    public DateTime? CompletedAt { get; private set; }
    
    // Navigation property
    public Model Model { get; set; } = null!;

    /// <summary>
    /// Creates a new thumbnail job for processing.
    /// </summary>
    public static ThumbnailJob Create(int modelId, int modelVersionId, string modelHash, DateTime createdAt, int maxAttempts = 3, int lockTimeoutMinutes = 10)
    {
        ValidateModelId(modelId);
        ValidateModelVersionId(modelVersionId);
        ValidateModelHash(modelHash);
        ValidateMaxAttempts(maxAttempts);
        ValidateLockTimeoutMinutes(lockTimeoutMinutes);

        return new ThumbnailJob
        {
            ModelId = modelId,
            ModelVersionId = modelVersionId,
            ModelHash = modelHash.Trim(),
            Status = ThumbnailJobStatus.Pending,
            MaxAttempts = maxAttempts,
            LockTimeoutMinutes = lockTimeoutMinutes,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Claims the job for processing by a specific worker.
    /// </summary>
    public bool TryClaim(string workerId, DateTime claimedAt)
    {
        ValidateWorkerId(workerId);

        // Cannot claim if already processing by another worker and lock is still valid
        if (Status == ThumbnailJobStatus.Processing && 
            !string.IsNullOrEmpty(LockedBy) && 
            LockedAt.HasValue && 
            claimedAt < LockedAt.Value.AddMinutes(LockTimeoutMinutes))
        {
            return false;
        }

        // Cannot claim if job is already done or dead
        if (Status == ThumbnailJobStatus.Done || Status == ThumbnailJobStatus.Dead)
        {
            return false;
        }

        Status = ThumbnailJobStatus.Processing;
        LockedBy = workerId.Trim();
        LockedAt = claimedAt;
        AttemptCount++;
        UpdatedAt = claimedAt;

        return true;
    }

    /// <summary>
    /// Marks the job as completed successfully.
    /// </summary>
    public void MarkAsCompleted(DateTime completedAt)
    {
        Status = ThumbnailJobStatus.Done;
        CompletedAt = completedAt;
        UpdatedAt = completedAt;
        LockedBy = null;
        LockedAt = null;
        ErrorMessage = null;
    }

    /// <summary>
    /// Marks the job as failed and determines if it should be retried or moved to dead letter queue.
    /// </summary>
    public void MarkAsFailed(string errorMessage, DateTime failedAt)
    {
        ValidateErrorMessage(errorMessage);

        ErrorMessage = errorMessage.Trim();
        UpdatedAt = failedAt;
        
        if (AttemptCount >= MaxAttempts)
        {
            Status = ThumbnailJobStatus.Dead;
            CompletedAt = failedAt;
        }
        else
        {
            Status = ThumbnailJobStatus.Pending;
        }
        
        LockedBy = null;
        LockedAt = null;
    }

    /// <summary>
    /// Resets the job for manual retry (admin function).
    /// </summary>
    public void Reset(DateTime resetAt)
    {
        Status = ThumbnailJobStatus.Pending;
        AttemptCount = 0;
        ErrorMessage = null;
        LockedBy = null;
        LockedAt = null;
        CompletedAt = null;
        UpdatedAt = resetAt;
    }

    /// <summary>
    /// Cancels the job if it's pending or processing.
    /// </summary>
    public void Cancel(DateTime cancelledAt)
    {
        if (Status != ThumbnailJobStatus.Pending && Status != ThumbnailJobStatus.Processing)
        {
            throw new InvalidOperationException($"Cannot cancel job with status {Status}. Only Pending or Processing jobs can be cancelled.");
        }

        Status = ThumbnailJobStatus.Dead;
        ErrorMessage = "Job cancelled due to model configuration change";
        CompletedAt = cancelledAt;
        UpdatedAt = cancelledAt;
        LockedBy = null;
        LockedAt = null;
    }

    /// <summary>
    /// Checks if the job lock has expired.
    /// </summary>
    public bool IsLockExpired(DateTime currentTime)
    {
        if (Status != ThumbnailJobStatus.Processing || !LockedAt.HasValue)
            return false;

        return currentTime >= LockedAt.Value.AddMinutes(LockTimeoutMinutes);
    }

    private static void ValidateModelId(int modelId)
    {
        if (modelId <= 0)
            throw new ArgumentException("Model ID must be greater than 0.", nameof(modelId));
    }

    private static void ValidateModelVersionId(int modelVersionId)
    {
        if (modelVersionId <= 0)
            throw new ArgumentException("Model Version ID must be greater than 0.", nameof(modelVersionId));
    }

    private static void ValidateModelHash(string modelHash)
    {
        if (string.IsNullOrWhiteSpace(modelHash))
            throw new ArgumentException("Model hash cannot be null or empty.", nameof(modelHash));
        
        if (modelHash.Length != 64) // SHA256 hash length
            throw new ArgumentException("Model hash must be a valid SHA256 hash (64 characters).", nameof(modelHash));
    }

    private static void ValidateMaxAttempts(int maxAttempts)
    {
        if (maxAttempts < 1)
            throw new ArgumentException("Max attempts must be at least 1.", nameof(maxAttempts));
        
        if (maxAttempts > 10)
            throw new ArgumentException("Max attempts cannot exceed 10.", nameof(maxAttempts));
    }

    private static void ValidateLockTimeoutMinutes(int lockTimeoutMinutes)
    {
        if (lockTimeoutMinutes < 1)
            throw new ArgumentException("Lock timeout must be at least 1 minute.", nameof(lockTimeoutMinutes));
        
        if (lockTimeoutMinutes > 60)
            throw new ArgumentException("Lock timeout cannot exceed 60 minutes.", nameof(lockTimeoutMinutes));
    }

    private static void ValidateWorkerId(string workerId)
    {
        if (string.IsNullOrWhiteSpace(workerId))
            throw new ArgumentException("Worker ID cannot be null or empty.", nameof(workerId));
        
        if (workerId.Length > 100)
            throw new ArgumentException("Worker ID cannot exceed 100 characters.", nameof(workerId));
    }

    private static void ValidateErrorMessage(string errorMessage)
    {
        if (string.IsNullOrWhiteSpace(errorMessage))
            throw new ArgumentException("Error message cannot be null or empty.", nameof(errorMessage));
        
        if (errorMessage.Length > 2000)
            throw new ArgumentException("Error message cannot exceed 2000 characters.", nameof(errorMessage));
    }
}