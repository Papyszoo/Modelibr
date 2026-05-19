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
    /// Only one backup may run at a time; subsequent calls while running throw InvalidOperationException.
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
    /// Stages a finished backup archive for restore-on-boot by copying it into the
    /// restore directory. Throws if the file is missing.
    /// </summary>
    void StageRestore(string fileName);
}

/// <summary>
/// Canonical backup manifest written into every archive as <c>manifest.json</c>.
///
/// IMPORTANT: this type is the single source of truth for the on-disk format.
/// Both <c>BackupService</c> (writer) and <c>RestoreOnBootProcessor</c> (reader)
/// consume this type — do not duplicate it.
///
/// When making any breaking change to the layout, bump
/// <see cref="BackupManifestConstants.CurrentManifestVersion"/>. The restore
/// processor refuses any archive whose <c>ManifestVersion</c> does not match
/// the value baked into the running app.
/// </summary>
public sealed record BackupManifest(
    int ManifestVersion,
    DateTime CreatedAtUtc,
    int PostgresMajorVersion,
    BackupManifestScope Scope,
    BackupManifestStats Stats);

public sealed record BackupManifestScope(bool Database, bool Uploads, bool Thumbnails);

public sealed record BackupManifestStats(
    int UploadsCount,
    long UploadsBytes,
    int ThumbnailsCount,
    long ThumbnailsBytes,
    long DatabaseDumpBytes,
    // SHA-256 of the database.dump entry's bytes as written into the archive.
    // Restore-on-boot verifies this against the extracted bytes before invoking
    // pg_restore, so a truncated or corrupted dump cannot silently produce a
    // partially-restored database.
    string DatabaseDumpSha256);

public static class BackupManifestConstants
{
    public const int CurrentManifestVersion = 1;
}
