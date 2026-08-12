using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// A queued asset metadata extraction, decoupled from thumbnail rendering so
/// re-extraction never requires re-rendering. Mirrors <see cref="ThumbnailJob"/>'s
/// locking / retry / dead-letter semantics and hash dedup, but carries an
/// <see cref="ExtractorFamily"/> so families can be given separate concurrency
/// limits (a queue of large geometry files must not delay script indexing).
/// </summary>
public class ExtractionJob
{
    public int Id { get; private set; }

    /// <summary>Asset family: "Model", "TextureSet", "Sound", "Script", "Sprite", "EnvironmentMap".</summary>
    public string AssetType { get; private set; } = string.Empty;

    /// <summary>Id of the asset to extract.</summary>
    public int AssetId { get; private set; }

    /// <summary>Version id where the family is versioned (models); null otherwise.</summary>
    public int? VersionId { get; private set; }

    /// <summary>SHA-256 of the target file (dedup + invalidation); null when not yet known.</summary>
    public string? FileSha256 { get; private set; }

    /// <summary>
    /// Extraction family for concurrency scheduling: "Geometry", "Script",
    /// "Material", "Audio". Distinct from <see cref="AssetType"/> so a single
    /// asset type can route to different worker pools if needed.
    /// </summary>
    public string ExtractorFamily { get; private set; } = string.Empty;

    public ExtractionJobStatus Status { get; private set; } = ExtractionJobStatus.Pending;

    public int AttemptCount { get; private set; }
    public int MaxAttempts { get; private set; } = 3;

    public string? ErrorMessage { get; private set; }

    /// <summary>
    /// Detail from a partial-but-usable run - the job can complete while still
    /// recording what was skipped. Surfaced in the UI alongside failures.
    /// </summary>
    public string? WarningDetail { get; private set; }

    public string? LockedBy { get; private set; }
    public DateTime? LockedAt { get; private set; }
    public int LockTimeoutMinutes { get; private set; } = 10;

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    public static ExtractionJob Create(
        string assetType,
        int assetId,
        string extractorFamily,
        DateTime createdAt,
        int? versionId = null,
        string? fileSha256 = null,
        int maxAttempts = 3,
        int lockTimeoutMinutes = 10)
    {
        ValidateAssetType(assetType);
        ValidateAssetId(assetId);
        ValidateExtractorFamily(extractorFamily);
        ValidateVersionId(versionId);
        ValidateFileSha256(fileSha256);
        ValidateMaxAttempts(maxAttempts);
        ValidateLockTimeoutMinutes(lockTimeoutMinutes);

        return new ExtractionJob
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            VersionId = versionId,
            FileSha256 = fileSha256?.Trim(),
            ExtractorFamily = extractorFamily.Trim(),
            Status = ExtractionJobStatus.Pending,
            MaxAttempts = maxAttempts,
            LockTimeoutMinutes = lockTimeoutMinutes,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>Claims the job for a worker, respecting an unexpired lock held by another worker.</summary>
    public bool TryClaim(string workerId, DateTime claimedAt)
    {
        ValidateWorkerId(workerId);

        if (Status == ExtractionJobStatus.Processing &&
            !string.IsNullOrEmpty(LockedBy) &&
            LockedAt.HasValue &&
            claimedAt < LockedAt.Value.AddMinutes(LockTimeoutMinutes))
        {
            return false;
        }

        if (Status == ExtractionJobStatus.Done || Status == ExtractionJobStatus.Dead)
        {
            return false;
        }

        Status = ExtractionJobStatus.Processing;
        LockedBy = workerId.Trim();
        LockedAt = claimedAt;
        AttemptCount++;
        UpdatedAt = claimedAt;
        return true;
    }

    /// <summary>Marks the job done. Partial success is valid - pass warning detail to keep it.</summary>
    public void MarkAsCompleted(DateTime completedAt, string? warningDetail = null)
    {
        Status = ExtractionJobStatus.Done;
        CompletedAt = completedAt;
        UpdatedAt = completedAt;
        LockedBy = null;
        LockedAt = null;
        ErrorMessage = null;
        WarningDetail = string.IsNullOrWhiteSpace(warningDetail) ? null : warningDetail.Trim();
    }

    /// <summary>Records a failure; retries until <see cref="MaxAttempts"/>, then dead-letters.</summary>
    public void MarkAsFailed(string errorMessage, DateTime failedAt)
    {
        ValidateErrorMessage(errorMessage);

        ErrorMessage = errorMessage.Trim();
        UpdatedAt = failedAt;

        if (AttemptCount >= MaxAttempts)
        {
            Status = ExtractionJobStatus.Dead;
            CompletedAt = failedAt;
        }
        else
        {
            Status = ExtractionJobStatus.Pending;
        }

        LockedBy = null;
        LockedAt = null;
    }

    /// <summary>Resets for a fresh attempt (manual retry, or expired-lock recovery).</summary>
    public void Reset(DateTime resetAt)
    {
        Status = ExtractionJobStatus.Pending;
        AttemptCount = 0;
        ErrorMessage = null;
        WarningDetail = null;
        LockedBy = null;
        LockedAt = null;
        CompletedAt = null;
        UpdatedAt = resetAt;
    }

    public bool IsLockExpired(DateTime currentTime)
    {
        if (Status != ExtractionJobStatus.Processing || !LockedAt.HasValue)
            return false;

        return currentTime >= LockedAt.Value.AddMinutes(LockTimeoutMinutes);
    }

    private static void ValidateAssetType(string assetType)
    {
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or whitespace.", nameof(assetType));
    }

    private static void ValidateAssetId(int assetId)
    {
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));
    }

    private static void ValidateExtractorFamily(string extractorFamily)
    {
        if (string.IsNullOrWhiteSpace(extractorFamily))
            throw new ArgumentException("Extractor family cannot be null or whitespace.", nameof(extractorFamily));
    }

    private static void ValidateVersionId(int? versionId)
    {
        if (versionId.HasValue && versionId.Value <= 0)
            throw new ArgumentException("Version id must be greater than 0 when provided.", nameof(versionId));
    }

    private static void ValidateFileSha256(string? fileSha256)
    {
        if (fileSha256 == null)
            return;
        if (string.IsNullOrWhiteSpace(fileSha256))
            throw new ArgumentException("File SHA-256 cannot be whitespace when provided.", nameof(fileSha256));
        if (fileSha256.Trim().Length != 64)
            throw new ArgumentException("File SHA-256 must be 64 characters.", nameof(fileSha256));
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
