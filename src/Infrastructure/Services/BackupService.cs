using System.Formats.Tar;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Application.Abstractions.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Infrastructure.Services;

public sealed class BackupService : IBackupService
{
    public const string ManifestEntryName = "manifest.json";
    public const string DatabaseDumpEntryName = "database.dump";
    public const string UploadsPrefix = "uploads/";
    public const string ThumbnailsPrefix = "thumbnails/";

    // Top-level directories under the uploads root excluded from backups entirely.
    // See the exclusion comment at the WriteDirectoryEntriesAsync call site for why each
    // one is here (and, just as importantly, why webdav-blend-orphans is NOT).
    private static readonly string[] UploadSkipDirNames = ["tmp", "webdav-blend-temp"];

    private readonly ILogger<BackupService> _logger;
    private readonly BackupPaths _paths;
    private readonly PostgresConnectionInfo _postgres;
    private readonly IBackupConsistencyGate _consistencyGate;
    private readonly SemaphoreSlim _runLock = new(1, 1);
    private readonly SemaphoreSlim _stageLock = new(1, 1);

    private readonly object _stateLock = new();
    private BackupSummary? _inProgress;

    public BackupService(
        IConfiguration configuration,
        ILogger<BackupService> logger,
        IBackupConsistencyGate consistencyGate)
    {
        _logger = logger;
        _paths = BackupPaths.FromConfiguration(configuration);
        _postgres = PostgresConnectionInfo.FromConfiguration(configuration);
        _consistencyGate = consistencyGate;

        Directory.CreateDirectory(_paths.BackupRoot);
        Directory.CreateDirectory(_paths.BackupTmp);
        Directory.CreateDirectory(_paths.RestoreRoot);
        Directory.CreateDirectory(_paths.RestoreProcessed);
        Directory.CreateDirectory(_paths.RestoreFailed);

        // Sweep leftover tmp files from a previously-crashed backup run.
        foreach (var stale in Directory.EnumerateFiles(_paths.BackupTmp))
        {
            try { File.Delete(stale); }
            catch (IOException ex) { _logger.LogWarning(ex, "Failed to delete stale tmp backup {Path}", stale); }
        }
    }

    public Task<BackupSummary> StartBackupAsync(BackupScope scope, CancellationToken cancellationToken)
    {
        if (!_runLock.Wait(0, cancellationToken))
        {
            throw new InvalidOperationException("A backup is already in progress.");
        }

        var createdAt = DateTime.UtcNow;
        var fileName = $"{BackupNaming.ManualBackupPrefix}{createdAt:yyyy-MM-dd-HHmmss}.tar";
        var finalPath = Path.Combine(_paths.BackupRoot, fileName);
        var tmpPath = Path.Combine(_paths.BackupTmp, fileName);

        var summary = new BackupSummary(
            FileName: fileName,
            SizeBytes: 0,
            CreatedAtUtc: createdAt,
            Status: "in_progress",
            HostPath: _paths.HostRelativeBackupPath(fileName),
            ContainerPath: finalPath,
            IncludesThumbnails: scope.IncludeThumbnails,
            Error: null);

        lock (_stateLock)
        {
            _inProgress = summary;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await RunBackupAsync(scope, tmpPath, finalPath, createdAt);
                lock (_stateLock) { _inProgress = null; }
                _logger.LogInformation("Backup completed: {FileName}", fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Backup failed: {FileName}", fileName);
                try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { /* swallow */ }
                lock (_stateLock)
                {
                    _inProgress = summary with { Status = "failed", Error = ex.Message };
                }
            }
            finally
            {
                _runLock.Release();
            }
        }, CancellationToken.None);

        return Task.FromResult(summary);
    }

    public IReadOnlyList<BackupSummary> ListBackups()
    {
        var list = new List<BackupSummary>();

        if (Directory.Exists(_paths.BackupRoot))
        {
            foreach (var file in Directory.EnumerateFiles(_paths.BackupRoot, "*.tar"))
            {
                var info = new FileInfo(file);
                bool includesThumbnails;
                try
                {
                    includesThumbnails = TryReadManifest(file)?.Scope?.Thumbnails ?? false;
                }
                catch
                {
                    includesThumbnails = false;
                }

                list.Add(new BackupSummary(
                    FileName: info.Name,
                    SizeBytes: info.Length,
                    CreatedAtUtc: info.LastWriteTimeUtc,
                    Status: "ready",
                    HostPath: _paths.HostRelativeBackupPath(info.Name),
                    ContainerPath: file,
                    IncludesThumbnails: includesThumbnails,
                    Error: null));
            }
        }

        lock (_stateLock)
        {
            if (_inProgress is not null)
            {
                list.RemoveAll(b => b.FileName == _inProgress.FileName);
                list.Add(_inProgress);
            }
        }

        return list.OrderByDescending(b => b.CreatedAtUtc).ToList();
    }

    public BackupStorageInfo GetStorageInfo()
    {
        long total = 0;
        if (Directory.Exists(_paths.BackupRoot))
        {
            foreach (var file in Directory.EnumerateFiles(_paths.BackupRoot, "*.tar"))
            {
                try { total += new FileInfo(file).Length; }
                catch { /* ignore */ }
            }
        }
        return new BackupStorageInfo(
            HostPath: _paths.HostBackupRoot,
            ContainerPath: _paths.BackupRoot,
            TotalUsedBytes: total);
    }

    public async Task<BackupSizeEstimate> EstimateSizeAsync(CancellationToken cancellationToken)
    {
        var dbBytes = await GetDatabaseSizeBytesAsync(cancellationToken);

        // Thumbnails physically live under the uploads root, so the raw uploads size
        // already contains them. Report them separately (they are what includeThumbnails
        // adds) so the UI does not count them twice.
        var thumbBytes = await GetThumbnailStorageSizeAsync();
        var uploadBytes = Math.Max(0, DirectorySize(_paths.UploadRoot) - thumbBytes);

        return new BackupSizeEstimate(dbBytes, uploadBytes, thumbBytes);
    }

    public string? ResolveBackupPath(string fileName)
    {
        if (!IsValidBackupName(fileName)) return null;
        var path = Path.Combine(_paths.BackupRoot, fileName);
        return File.Exists(path) ? path : null;
    }

    public void DeleteBackup(string fileName)
    {
        if (!IsValidBackupName(fileName))
            throw new ArgumentException("Invalid backup filename.", nameof(fileName));

        var path = Path.Combine(_paths.BackupRoot, fileName);
        if (!File.Exists(path))
            throw new FileNotFoundException("Backup not found.", fileName);

        File.Delete(path);
    }

    public void StageRestore(string fileName)
    {
        if (!IsValidBackupName(fileName))
            throw new ArgumentException("Invalid backup filename.", nameof(fileName));

        var source = Path.Combine(_paths.BackupRoot, fileName);
        if (!File.Exists(source))
            throw new FileNotFoundException("Backup not found.", fileName);

        // Single-lock the clear-then-copy sequence so concurrent calls cannot
        // interleave and leave the wrong backup staged.
        _stageLock.Wait();
        try
        {
            // Clear any older staged restore so only the newest takes effect on boot.
            foreach (var existing in Directory.EnumerateFiles(_paths.RestoreRoot, "*.tar"))
            {
                try { File.Delete(existing); }
                catch (IOException ex) { _logger.LogWarning(ex, "Failed to clear staged restore {Path}", existing); }
            }

            var target = Path.Combine(_paths.RestoreRoot, fileName);
            // Copy into a .tmp sibling first, fsync, then atomic rename - guarantees
            // the boot processor never sees a half-copied archive.
            var tmpTarget = target + ".staging";
            File.Copy(source, tmpTarget, overwrite: true);
            FsyncFile(tmpTarget);
            if (File.Exists(target)) File.Delete(target);
            File.Move(tmpTarget, target);
        }
        finally
        {
            _stageLock.Release();
        }
    }

    public async Task<BackupSummary> CreateSnapshotAsync(BackupScope scope, string fileNamePrefix, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(fileNamePrefix))
            throw new ArgumentException("Snapshot filename prefix must not be empty.", nameof(fileNamePrefix));

        if (!_runLock.Wait(0, cancellationToken))
        {
            throw new InvalidOperationException("A backup is already in progress.");
        }

        var createdAt = DateTime.UtcNow;
        var fileName = $"{fileNamePrefix}{createdAt:yyyy-MM-dd-HHmmss}.tar";
        var finalPath = Path.Combine(_paths.BackupRoot, fileName);
        var tmpPath = Path.Combine(_paths.BackupTmp, fileName);

        try
        {
            await RunBackupAsync(scope, tmpPath, finalPath, createdAt);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Automatic snapshot failed: {FileName}", fileName);
            try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { /* swallow */ }
            throw;
        }
        finally
        {
            _runLock.Release();
        }

        var info = new FileInfo(finalPath);
        _logger.LogInformation("Automatic snapshot completed: {FileName} ({SizeBytes} bytes)", fileName, info.Length);

        return new BackupSummary(
            FileName: fileName,
            SizeBytes: info.Length,
            CreatedAtUtc: createdAt,
            Status: "ready",
            HostPath: _paths.HostRelativeBackupPath(fileName),
            ContainerPath: finalPath,
            IncludesThumbnails: scope.IncludeThumbnails,
            Error: null);
    }

    public void CleanupSnapshots(string fileNamePrefix, int keepCount)
    {
        if (string.IsNullOrWhiteSpace(fileNamePrefix))
            throw new ArgumentException("Snapshot filename prefix must not be empty.", nameof(fileNamePrefix));
        if (keepCount < 0)
            throw new ArgumentOutOfRangeException(nameof(keepCount), keepCount, "Retention count cannot be negative.");

        if (!Directory.Exists(_paths.BackupRoot)) return;

        // The filename embeds the creation timestamp (yyyy-MM-dd-HHmmss), so an
        // ordinal sort of the name is already chronological - no need to hit the
        // filesystem for LastWriteTimeUtc.
        var candidates = Directory.EnumerateFiles(_paths.BackupRoot, $"{fileNamePrefix}*.tar")
            .OrderByDescending(path => Path.GetFileName(path), StringComparer.Ordinal)
            .ToList();

        foreach (var stale in candidates.Skip(keepCount))
        {
            try
            {
                File.Delete(stale);
                _logger.LogInformation("Pruned old automatic snapshot: {FileName}", Path.GetFileName(stale));
            }
            catch (IOException ex)
            {
                _logger.LogWarning(ex, "Failed to prune old automatic snapshot {Path}", stale);
            }
        }
    }

    // ── private ─────────────────────────────────────────────────────────

    private async Task RunBackupAsync(BackupScope scope, string tmpPath, string finalPath, DateTime createdAt)
    {
        // Keep the file tree stable from the database dump through archive
        // enumeration. This is intentionally scoped to the existing physical
        // file-storage boundary rather than a new database-wide lock.
        await using var snapshotLease = await _consistencyGate.EnterSnapshotAsync(CancellationToken.None);

        var dumpPath = tmpPath + ".dump";
        long uploadsBytes = 0;
        int uploadsCount = 0;
        long thumbsBytes = 0;
        int thumbsCount = 0;

        try
        {
            // Query the authoritative File table before the dump. This catches
            // the delete-before-commit ordering in PermanentDeleteEntityCommand:
            // if the row is still visible while its physical file is already
            // gone, fail rather than publishing a database/file mismatch.
            var referencedBeforeDump = await GetReferencedUploadPathsAsync();
            EnsureReferencedUploadFilesExist(referencedBeforeDump);

            // The dumper reports the server's actual major version, so the manifest
            // records the truth rather than a baked-in literal.
            var header = await WriteDatabaseDumpAsync(dumpPath);
            var pgMajor = header.PostgresMajorVersion;

            // A second read closes the other side of the race: a row committed
            // while the dump was running must be checked too. The physical-file
            // gate prevents the matching file from disappearing during this
            // window, but the database reference is still authoritative here.
            var referencedAfterDump = await GetReferencedUploadPathsAsync();
            var referencedUploadPaths = referencedBeforeDump
                .Concat(referencedAfterDump)
                .Distinct(StringComparer.Ordinal)
                .ToList();
            var dumpInfo = new FileInfo(dumpPath);
            var dumpSha = await ComputeSha256Async(dumpPath);

            // Thumbnails and previews live under the uploads root (content-addressed,
            // like every other file), so the plain uploads sweep below would carry them.
            // Resolve the referenced set once and either keep it out of that sweep - the
            // default, and what makes includeThumbnails meaningful - or write it as its
            // own section so the manifest's thumbnail count is real.
            var thumbnailRelativePaths = (await GetThumbnailUploadPathsAsync())
                .Select(path => ToUploadRelative(path, _paths.UploadRoot))
                .ToHashSet(StringComparer.Ordinal);

            await using (var outStream = File.Create(tmpPath))
            await using (var tar = new TarWriter(outStream, TarEntryFormat.Pax, leaveOpen: false))
            {
                // database.dump first so a streaming reader can extract the DB
                // even before scanning every upload entry. Manifest is written
                // last so its stats reflect the actual contents.
                await WriteFileEntryAsync(tar, dumpPath, DatabaseDumpEntryName);

                if (Directory.Exists(_paths.UploadRoot))
                {
                    // Skip uploads/tmp/ (HashBasedFileStorage's staging dir for in-flight
                    // uploads) and uploads/webdav-blend-temp/ (in-flight Blender Safe-Save
                    // uploads - unprocessed, ages out via BlenderRetentionSweeper, and
                    // restoring it would just replay half-finished saves). Deliberately
                    // NOT skipping uploads/webdav-blend-orphans/: those are quarantined
                    // user bytes that survived a failed save - real user data that a
                    // restore must bring back (prompt 30, item 5).
                    (uploadsCount, uploadsBytes) = await WriteDirectoryEntriesAsync(
                        tar,
                        _paths.UploadRoot,
                        UploadsPrefix,
                        skipDirNames: UploadSkipDirNames,
                        excludeRelativePaths: thumbnailRelativePaths);
                }

                if (scope.IncludeThumbnails && thumbnailRelativePaths.Count > 0)
                {
                    (thumbsCount, thumbsBytes) = await WriteThumbnailEntriesAsync(
                        tar, _paths.UploadRoot, thumbnailRelativePaths);
                }

                // Validate after enumeration as well as before the dump. The
                // archive is still only a staging file at this point, so a
                // mismatch cannot be published.
                EnsureReferencedUploadFilesExist(referencedUploadPaths);

                var manifest = new BackupManifest(
                    ManifestVersion: BackupManifestConstants.CurrentManifestVersion,
                    CreatedAtUtc: createdAt,
                    PostgresMajorVersion: pgMajor,
                    Scope: new BackupManifestScope(
                        Database: true,
                        Uploads: true,
                        Thumbnails: scope.IncludeThumbnails),
                    DatabaseDumpFormat: ManagedDumpFormat.Id,
                    Stats: new BackupManifestStats(
                        UploadsCount: uploadsCount,
                        UploadsBytes: uploadsBytes,
                        ThumbnailsCount: thumbsCount,
                        ThumbnailsBytes: thumbsBytes,
                        DatabaseDumpBytes: dumpInfo.Length,
                        DatabaseDumpSha256: dumpSha));

                await WriteJsonEntryAsync(tar, ManifestEntryName, manifest);
            }

            // Force the OS to write the file's bytes to disk before we make it
            // visible. Without this, a power loss between completion and the
            // OS flushing buffers could leave a zero-byte or torn archive.
            FsyncFile(tmpPath);

            // Atomic publish.
            if (File.Exists(finalPath)) File.Delete(finalPath);
            File.Move(tmpPath, finalPath);
        }
        finally
        {
            if (File.Exists(dumpPath))
            {
                try { File.Delete(dumpPath); }
                catch (IOException ex) { _logger.LogWarning(ex, "Failed to delete temp dump {Path}", dumpPath); }
            }
        }
    }

    private async Task<IReadOnlyCollection<string>> GetReferencedUploadPathsAsync()
    {
        // The first-boot pre-migration backup runs before the schema exists.
        // Avoid treating an absent Files table as a database failure; once the
        // table exists, any query failure is still fatal to the backup.
        var tableExists = await ScalarAsync(
            "SELECT to_regclass('public.\"Files\"') IS NOT NULL;");
        if (!string.Equals(tableExists, "t", StringComparison.OrdinalIgnoreCase))
        {
            return Array.Empty<string>();
        }

        var output = await QueryAsync("SELECT DISTINCT \"FilePath\" FROM \"Files\";");
        return output
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(path => path.Length > 0)
            .ToList();
    }

    /// <summary>
    /// Every thumbnail / preview path the database knows about, across every asset
    /// family that stores one. These files live under the uploads root, so they have
    /// to be identified to be left out of the uploads sweep (or included deliberately).
    /// </summary>
    /// <remarks>
    /// Each table is probed before it is queried because the first-boot pre-migration
    /// backup runs before any schema exists, and later tables arrive with later
    /// migrations - one absent table must not fail the whole backup.
    /// </remarks>
    private async Task<IReadOnlyCollection<string>> GetThumbnailUploadPathsAsync()
    {
        var columnsByTable = new (string Table, string[] Columns)[]
        {
            ("Thumbnails", ["ThumbnailPath", "PngThumbnailPath"]),
            ("TextureSets", ["ThumbnailPath", "PngThumbnailPath"]),
            ("EnvironmentMapVariants", ["ThumbnailPath"]),
            ("Materials", ["ThumbnailPath", "PngThumbnailPath"]),
            ("Vfx", ["ThumbnailPath"]),
            ("SceneRenders", ["FilePath"]),
        };

        var paths = new List<string>();
        await using var connection = await OpenConnectionAsync();

        foreach (var (table, columns) in columnsByTable)
        {
            if (!await TableExistsAsync(connection, table)) continue;

            foreach (var column in columns)
            {
                await using var command = new NpgsqlCommand(
                    $"SELECT DISTINCT \"{column}\" FROM \"{table}\" " +
                    $"WHERE \"{column}\" IS NOT NULL AND \"{column}\" <> '';",
                    connection);
                await using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    paths.Add(reader.GetString(0));
                }
            }
        }

        return paths.Distinct(StringComparer.Ordinal).ToList();
    }

    private async Task<long> GetThumbnailStorageSizeAsync()
    {
        // A size probe must never stand between a user and their backup, so any
        // failure degrades to zero rather than throwing.
        try
        {
            long total = 0;
            foreach (var path in await GetThumbnailUploadPathsAsync())
            {
                try
                {
                    var full = Path.Combine(_paths.UploadRoot, ToUploadRelative(path, _paths.UploadRoot));
                    var info = new FileInfo(full);
                    if (info.Exists) total += info.Length;
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    // Unreadable single file - skip it.
                }
            }

            return total;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not estimate thumbnail storage; the estimate omits it.");
            return 0;
        }
    }

    private static async Task<bool> TableExistsAsync(NpgsqlConnection connection, string table)
    {
        await using var command = new NpgsqlCommand("SELECT to_regclass(@name) IS NOT NULL;", connection);
        command.Parameters.AddWithValue("name", $"public.\"{table}\"");
        return await command.ExecuteScalarAsync() is true;
    }

    /// <summary>
    /// Expresses a stored path the way the uploads sweep sees it: relative to the
    /// uploads root, with forward slashes. A path already relative is returned as is;
    /// an absolute one (a row written before the relative-path migration, or a
    /// pre-migration snapshot) has the current root stripped when it sits under it.
    /// </summary>
    internal static string ToUploadRelative(string storedPath, string uploadRoot)
    {
        var normalized = storedPath.Replace('\\', '/');
        if (!Path.IsPathRooted(storedPath)) return normalized;

        var rootFull = Path.GetFullPath(uploadRoot);
        var rootPrefix = rootFull.EndsWith(Path.DirectorySeparatorChar)
            ? rootFull
            : rootFull + Path.DirectorySeparatorChar;
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;

        string full;
        try
        {
            full = Path.GetFullPath(storedPath);
        }
        catch (Exception ex) when (ex is ArgumentException or IOException or NotSupportedException)
        {
            return normalized;
        }

        return full.StartsWith(rootPrefix, comparison)
            ? Path.GetRelativePath(rootFull, full).Replace('\\', '/')
            : normalized;
    }

    /// <summary>
    /// Runs a scalar query over the same connection the dump uses.
    /// </summary>
    /// <remarks>
    /// This used to shell out to <c>psql</c>. It cannot any more: the embedded
    /// PostgreSQL the desktop app ships carries the server, not the client tools,
    /// and the app already has a driver for the server.
    ///
    /// The result comes back as <see cref="object"/> because a PostgreSQL scalar is
    /// not always a string - <c>to_regclass(...) IS NOT NULL</c> is a boolean - and
    /// casting that to <c>string</c> throws rather than returning anything. So it is
    /// stringified, which is what the two callers wanted all along.
    /// </remarks>
    private async Task<string?> ScalarAsync(string query)
    {
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(query, connection);
        var value = await command.ExecuteScalarAsync();
        return value switch
        {
            null => null,
            string text => text,
            bool flag => flag ? "t" : "f",
            IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString(),
        };
    }

    private async Task<string> QueryAsync(string query)
    {
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(query, connection);
        var value = await command.ExecuteScalarAsync();
        return value switch
        {
            null => string.Empty,
            string text => text,
            bool flag => flag ? "t" : "f",
            IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString() ?? string.Empty,
        };
    }

    private async Task<NpgsqlConnection> OpenConnectionAsync()
    {
        var connection = new NpgsqlConnection(BuildConnectionString());
        await connection.OpenAsync();
        return connection;
    }

    private string BuildConnectionString() => new NpgsqlConnectionStringBuilder
    {
        Host = _postgres.Host,
        Port = _postgres.Port,
        Database = _postgres.Database,
        Username = _postgres.User,
        Password = _postgres.Password,
    }.ConnectionString;

    /// <summary>
    /// Writes the database half of the archive.
    /// </summary>
    /// <remarks>
    /// Replaces <c>pg_dump -Fc</c>. The dump is COPY text streamed through Npgsql -
    /// see <see cref="ManagedDatabaseDumpper"/> for why the client tools are not an
    /// option here and what the format gives up (schema) in exchange.
    /// </remarks>
    private async Task<ManagedDumpHeader> WriteDatabaseDumpAsync(string outputPath)
    {
        await using var connection = await OpenConnectionAsync();

        // A repeatable-read transaction is what makes a per-table dump a
        // consistent snapshot of the whole database, which is what pg_dump's own
        // transaction gave us for free.
        await using var transaction = await connection.BeginTransactionAsync(
            System.Data.IsolationLevel.RepeatableRead);

        var dumpper = new ManagedDatabaseDumpper(_logger);
        await using var output = File.Create(outputPath);
        var header = await dumpper.WriteAsync(connection, output);

        await transaction.CommitAsync();
        return header;
    }

    private void EnsureReferencedUploadFilesExist(IEnumerable<string> referencedPaths)
    {
        var missing = FindMissingReferencedUploadPaths(referencedPaths, _paths.UploadRoot);
        if (missing.Count == 0) return;

        throw new InvalidOperationException(
            "Backup consistency check failed: referenced upload files are missing: " +
            string.Join(", ", missing));
    }

    /// <summary>
    /// Returns only authoritative File paths that cannot be represented in the
    /// upload tree. Unreferenced extra files are intentionally ignored.
    /// </summary>
    internal static IReadOnlyList<string> FindMissingReferencedUploadPaths(
        IEnumerable<string> referencedPaths,
        string uploadRoot)
    {
        var rootFullPath = Path.GetFullPath(uploadRoot);
        var rootPrefix = rootFullPath.EndsWith(Path.DirectorySeparatorChar)
            ? rootFullPath
            : rootFullPath + Path.DirectorySeparatorChar;
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        var missing = new List<string>();

        foreach (var referencedPath in referencedPaths)
        {
            if (string.IsNullOrWhiteSpace(referencedPath))
            {
                missing.Add(referencedPath);
                continue;
            }

            string fullPath;
            try
            {
                fullPath = Path.GetFullPath(Path.Combine(rootFullPath, referencedPath));
            }
            catch (Exception ex) when (ex is ArgumentException or IOException or NotSupportedException)
            {
                missing.Add(referencedPath);
                continue;
            }

            var isWithinUploadRoot = fullPath.Equals(rootFullPath, comparison)
                || fullPath.StartsWith(rootPrefix, comparison);
            if (!isWithinUploadRoot || !File.Exists(fullPath))
            {
                missing.Add(referencedPath);
            }
        }

        return missing.Distinct(StringComparer.Ordinal).ToList();
    }

    private static async Task WriteFileEntryAsync(TarWriter tar, string filePath, string entryName)
    {
        var entry = new PaxTarEntry(TarEntryType.RegularFile, entryName);
        await using (var fs = File.OpenRead(filePath))
        {
            entry.DataStream = fs;
            await tar.WriteEntryAsync(entry);
        }
    }

    private static async Task<(int count, long bytes)> WriteDirectoryEntriesAsync(
        TarWriter tar,
        string rootDir,
        string entryPrefix,
        IReadOnlyCollection<string>? skipDirNames = null,
        IReadOnlySet<string>? excludeRelativePaths = null)
    {
        var count = 0;
        long bytes = 0;
        var rootFull = Path.GetFullPath(rootDir);

        foreach (var path in Directory.EnumerateFiles(rootDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(rootFull, path).Replace('\\', '/');
            if (skipDirNames is { Count: > 0 }
                && skipDirNames.Any(skip => relative.StartsWith(skip + "/", StringComparison.Ordinal)))
            {
                continue;
            }
            if (excludeRelativePaths is not null && excludeRelativePaths.Contains(relative)) continue;

            var entryName = entryPrefix + relative;
            var entry = new PaxTarEntry(TarEntryType.RegularFile, entryName);
            await using var fs = File.OpenRead(path);
            // fs.Length is valid here regardless of stream position - it returns the
            // file's size, not bytes-read-since-open.
            var size = fs.Length;
            entry.DataStream = fs;
            await tar.WriteEntryAsync(entry);
            count++;
            bytes += size;
        }

        return (count, bytes);
    }

    /// <summary>
    /// Writes the referenced thumbnail files as their own <c>thumbnails/</c> section.
    /// They physically live under the uploads root, but naming them separately is what
    /// lets a restore count what it got and lets a backup without them omit them
    /// cleanly. A path whose file is gone is skipped - the count reflects the archive.
    /// </summary>
    private static async Task<(int count, long bytes)> WriteThumbnailEntriesAsync(
        TarWriter tar,
        string uploadRoot,
        IEnumerable<string> relativePaths)
    {
        var count = 0;
        long bytes = 0;

        foreach (var relative in relativePaths)
        {
            var fullPath = Path.Combine(uploadRoot, relative);
            if (!File.Exists(fullPath)) continue;

            var entry = new PaxTarEntry(TarEntryType.RegularFile, ThumbnailsPrefix + relative);
            await using var fs = File.OpenRead(fullPath);
            var size = fs.Length;
            entry.DataStream = fs;
            await tar.WriteEntryAsync(entry);
            count++;
            bytes += size;
        }

        return (count, bytes);
    }

    private static async Task WriteJsonEntryAsync<T>(TarWriter tar, string entryName, T payload)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(payload, new JsonSerializerOptions { WriteIndented = true });
        var entry = new PaxTarEntry(TarEntryType.RegularFile, entryName);
        entry.DataStream = new MemoryStream(json);
        await tar.WriteEntryAsync(entry);
    }

    private static BackupManifest? TryReadManifest(string tarPath)
    {
        using var fs = File.OpenRead(tarPath);
        using var reader = new TarReader(fs);
        TarEntry? entry;
        while ((entry = reader.GetNextEntry(copyData: true)) != null)
        {
            if (entry.Name == ManifestEntryName && entry.DataStream != null)
            {
                using var ms = new MemoryStream();
                entry.DataStream.CopyTo(ms);
                ms.Position = 0;
                return JsonSerializer.Deserialize<BackupManifest>(ms);
            }
        }
        return null;
    }

    private static async Task<string> ComputeSha256Async(string filePath)
    {
        await using var fs = File.OpenRead(filePath);
        using var sha = SHA256.Create();
        var hash = await sha.ComputeHashAsync(fs);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static void FsyncFile(string path)
    {
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.Read);
            fs.Flush(flushToDisk: true);
        }
        catch (IOException)
        {
            // Best-effort. On filesystems that don't support fsync (rare in our
            // bind-mounted Linux setup) the rest of the pipeline still produces
            // a valid archive - the manifest read on restore catches truncation.
        }
    }

    private async Task<long> GetDatabaseSizeBytesAsync(CancellationToken cancellationToken)
    {
        // An estimate, not a measurement that must be exact: 0 on any failure is
        // the honest answer for "how big will the database half be" and keeps a
        // size probe from ever standing between a user and their backup.
        try
        {
            await using var connection = await OpenConnectionAsync();
            await using var command = new NpgsqlCommand(
                "SELECT pg_database_size(current_database());", connection);
            var size = await command.ExecuteScalarAsync(cancellationToken);
            return size is long bytes ? bytes : 0;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read the database size; the estimate omits it.");
            return 0;
        }
    }

    private static long DirectorySize(string dir)
    {
        if (!Directory.Exists(dir)) return 0;
        try
        {
            return Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories)
                .Sum(f => { try { return new FileInfo(f).Length; } catch { return 0L; } });
        }
        catch
        {
            return 0;
        }
    }

    private static bool IsValidBackupName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;
        if (name.Contains('/') || name.Contains('\\') || name.Contains("..", StringComparison.Ordinal)) return false;
        if (!name.EndsWith(".tar", StringComparison.OrdinalIgnoreCase)) return false;
        return name.StartsWith(BackupNaming.ManualBackupPrefix, StringComparison.OrdinalIgnoreCase)
            || name.StartsWith(BackupNaming.PreMigrationSnapshotPrefix, StringComparison.OrdinalIgnoreCase);
    }

    // ── nested config types ─────────────────────────────────────────────

    internal sealed class BackupPaths
    {
        public required string BackupRoot { get; init; }
        public required string BackupTmp { get; init; }
        public required string RestoreRoot { get; init; }
        public required string RestoreProcessed { get; init; }
        public required string RestoreFailed { get; init; }
        public required string UploadRoot { get; init; }
        public required string ThumbnailRoot { get; init; }
        // Best-effort hint shown in the UI so operators know where to find the
        // archive on the host. Defaults to the value used by docker-compose;
        // override with BACKUP_HOST_DISPLAY_PATH if your bind mount differs.
        public required string HostBackupRoot { get; init; }

        public string HostRelativeBackupPath(string fileName)
        {
            var trimmed = HostBackupRoot.TrimEnd('/', '\\');
            return $"{trimmed}/{fileName}";
        }

        public static BackupPaths FromConfiguration(IConfiguration cfg)
        {
            var backupRoot = cfg["BACKUP_STORAGE_PATH"] ?? "/var/lib/modelibr/backups";
            var restoreRoot = cfg["RESTORE_STORAGE_PATH"] ?? "/var/lib/modelibr/restore";
            var uploadRoot = cfg["UPLOAD_STORAGE_PATH"] ?? "/var/lib/modelibr/uploads";
            var thumbRoot = cfg["THUMBNAIL_STORAGE_PATH"] ?? "/var/lib/modelibr/thumbnails";
            var hostBackupRoot = cfg["BACKUP_HOST_DISPLAY_PATH"] ?? "./data/backups";
            return new BackupPaths
            {
                BackupRoot = backupRoot,
                BackupTmp = Path.Combine(backupRoot, ".tmp"),
                RestoreRoot = restoreRoot,
                RestoreProcessed = Path.Combine(restoreRoot, "processed"),
                RestoreFailed = Path.Combine(restoreRoot, "failed"),
                UploadRoot = uploadRoot,
                ThumbnailRoot = thumbRoot,
                HostBackupRoot = hostBackupRoot,
            };
        }
    }

    internal sealed class PostgresConnectionInfo
    {
        public required string Host { get; init; }
        public required int Port { get; init; }
        public required string Database { get; init; }
        public required string User { get; init; }
        public required string Password { get; init; }

        public static PostgresConnectionInfo FromConfiguration(IConfiguration cfg)
        {
            return new PostgresConnectionInfo
            {
                Host = cfg["POSTGRES_HOST"] ?? "postgres",
                Port = int.TryParse(cfg["POSTGRES_PORT"], out var p) ? p : 5432,
                Database = cfg["POSTGRES_DB"] ?? "Modelibr",
                User = cfg["POSTGRES_USER"] ?? "modelibr",
                Password = cfg["POSTGRES_PASSWORD"] ?? string.Empty,
            };
        }
    }
}
