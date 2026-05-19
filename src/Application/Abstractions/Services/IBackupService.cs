namespace Application.Abstractions.Services;

public record BackupScope(bool IncludeThumbnails);

public record BackupSummary(
    string FileName,
    long SizeBytes,
    DateTime CreatedAtUtc,
    string Status,
    string HostPath,
    string ContainerPath,
    bool IncludesThumbnails,
    string? Error);

public record BackupStorageInfo(
    string HostPath,
    string ContainerPath,
    long TotalUsedBytes);

public record BackupSizeEstimate(
    long DatabaseBytes,
    long UploadsBytes,
    long ThumbnailsBytes);

public interface IBackupService
{
    /// <summary>
    /// Starts a backup job in the background. Returns immediately with the placeholder summary.
    /// Only one backup may run at a time; subsequent calls while running return a Conflict-style result.
    /// </summary>
    Task<BackupSummary> StartBackupAsync(BackupScope scope, CancellationToken cancellationToken);

    /// <summary>
    /// Lists archives in the backups directory plus any in-progress job.
    /// </summary>
    IReadOnlyList<BackupSummary> ListBackups();

    BackupStorageInfo GetStorageInfo();

    Task<BackupSizeEstimate> EstimateSizeAsync(CancellationToken cancellationToken);

    /// <summary>Absolute path to a finished backup archive, or null if missing.</summary>
    string? ResolveBackupPath(string fileName);

    void DeleteBackup(string fileName);

    /// <summary>
    /// Stages a finished backup archive for restore-on-boot by hard-linking (or copying)
    /// it into the restore directory. Throws if the file is missing.
    /// </summary>
    void StageRestore(string fileName);
}
