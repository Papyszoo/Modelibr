using System.Diagnostics;
using System.Formats.Tar;
using System.Security.Cryptography;
using System.Text.Json;
using Application.Abstractions.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

public sealed class BackupService : IBackupService
{
    public const string ManifestEntryName = "manifest.json";
    public const string DatabaseDumpEntryName = "database.dump";
    public const string UploadsPrefix = "uploads/";
    public const string ThumbnailsPrefix = "thumbnails/";

    private readonly ILogger<BackupService> _logger;
    private readonly BackupPaths _paths;
    private readonly PostgresConnectionInfo _postgres;
    private readonly SemaphoreSlim _runLock = new(1, 1);
    private readonly SemaphoreSlim _stageLock = new(1, 1);

    private readonly object _stateLock = new();
    private BackupSummary? _inProgress;

    public BackupService(IConfiguration configuration, ILogger<BackupService> logger)
    {
        _logger = logger;
        _paths = BackupPaths.FromConfiguration(configuration);
        _postgres = PostgresConnectionInfo.FromConfiguration(configuration);

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
        var fileName = $"modelibr-{createdAt:yyyy-MM-dd-HHmmss}.tar";
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
        var uploadBytes = DirectorySize(_paths.UploadRoot);
        var thumbBytes = DirectorySize(_paths.ThumbnailRoot);
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
            // Copy into a .tmp sibling first, fsync, then atomic rename — guarantees
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

    // ── private ─────────────────────────────────────────────────────────

    private async Task RunBackupAsync(BackupScope scope, string tmpPath, string finalPath, DateTime createdAt)
    {
        var dumpPath = tmpPath + ".dump";
        long uploadsBytes = 0;
        int uploadsCount = 0;
        long thumbsBytes = 0;
        int thumbsCount = 0;

        try
        {
            // Pre-flight: query the running Postgres for its actual major version
            // so the manifest reports the truth, not a baked-in literal.
            var pgMajor = await GetPostgresMajorVersionAsync();

            await RunPgDumpAsync(dumpPath);
            var dumpInfo = new FileInfo(dumpPath);
            var dumpSha = await ComputeSha256Async(dumpPath);

            await using (var outStream = File.Create(tmpPath))
            await using (var tar = new TarWriter(outStream, TarEntryFormat.Pax, leaveOpen: false))
            {
                // database.dump first so a streaming reader can extract the DB
                // even before scanning every upload entry. Manifest is written
                // last so its stats reflect the actual contents.
                await WriteFileEntryAsync(tar, dumpPath, DatabaseDumpEntryName);

                if (Directory.Exists(_paths.UploadRoot))
                {
                    // Skip uploads/tmp/ — that's HashBasedFileStorage's staging directory for in-flight uploads.
                    (uploadsCount, uploadsBytes) = await WriteDirectoryEntriesAsync(
                        tar, _paths.UploadRoot, UploadsPrefix, skipDirName: "tmp");
                }

                if (scope.IncludeThumbnails && Directory.Exists(_paths.ThumbnailRoot))
                {
                    (thumbsCount, thumbsBytes) = await WriteDirectoryEntriesAsync(
                        tar, _paths.ThumbnailRoot, ThumbnailsPrefix, skipDirName: null);
                }

                var manifest = new BackupManifest(
                    ManifestVersion: BackupManifestConstants.CurrentManifestVersion,
                    CreatedAtUtc: createdAt,
                    PostgresMajorVersion: pgMajor,
                    Scope: new BackupManifestScope(
                        Database: true,
                        Uploads: true,
                        Thumbnails: scope.IncludeThumbnails),
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

    private async Task RunPgDumpAsync(string outputPath)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "pg_dump",
            ArgumentList =
            {
                "-Fc",                               // custom format (compressed)
                "-h", _postgres.Host,
                "-p", _postgres.Port.ToString(),
                "-U", _postgres.User,
                "-d", _postgres.Database,
                "-f", outputPath,
            },
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
        };
        psi.Environment["PGPASSWORD"] = _postgres.Password;

        using var p = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to launch pg_dump.");
        var stderr = await p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync();
        if (p.ExitCode != 0)
        {
            throw new InvalidOperationException($"pg_dump exited with code {p.ExitCode}: {stderr}");
        }
    }

    private async Task<int> GetPostgresMajorVersionAsync()
    {
        var psi = new ProcessStartInfo
        {
            FileName = "psql",
            ArgumentList =
            {
                "-h", _postgres.Host,
                "-p", _postgres.Port.ToString(),
                "-U", _postgres.User,
                "-d", _postgres.Database,
                "-t", "-A",
                "-c", "SHOW server_version_num",
            },
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.Environment["PGPASSWORD"] = _postgres.Password;

        using var p = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to launch psql for version probe.");
        var output = (await p.StandardOutput.ReadToEndAsync()).Trim();
        await p.WaitForExitAsync();
        if (p.ExitCode != 0 || !int.TryParse(output, out var verNum))
        {
            throw new InvalidOperationException($"Failed to read postgres version (exit {p.ExitCode}): '{output}'");
        }
        // server_version_num format: 160003 → major 16; 170000 → 17. Major = verNum / 10000.
        return verNum / 10000;
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
        string? skipDirName)
    {
        var count = 0;
        long bytes = 0;
        var rootFull = Path.GetFullPath(rootDir);

        foreach (var path in Directory.EnumerateFiles(rootDir, "*", SearchOption.AllDirectories))
        {
            if (skipDirName != null)
            {
                var rel = Path.GetRelativePath(rootFull, path).Replace('\\', '/');
                if (rel.StartsWith(skipDirName + "/", StringComparison.Ordinal)) continue;
            }
            var relative = Path.GetRelativePath(rootFull, path).Replace('\\', '/');
            var entryName = entryPrefix + relative;
            var entry = new PaxTarEntry(TarEntryType.RegularFile, entryName);
            await using var fs = File.OpenRead(path);
            // fs.Length is valid here regardless of stream position — it returns the
            // file's size, not bytes-read-since-open.
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
            // a valid archive — the manifest read on restore catches truncation.
        }
    }

    private async Task<long> GetDatabaseSizeBytesAsync(CancellationToken cancellationToken)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "psql",
            ArgumentList =
            {
                "-h", _postgres.Host,
                "-p", _postgres.Port.ToString(),
                "-U", _postgres.User,
                "-d", _postgres.Database,
                "-t", "-A",
                "-c", $"SELECT pg_database_size('{_postgres.Database}')",
            },
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.Environment["PGPASSWORD"] = _postgres.Password;

        try
        {
            using var p = Process.Start(psi);
            if (p == null) return 0;
            var output = await p.StandardOutput.ReadToEndAsync(cancellationToken);
            await p.WaitForExitAsync(cancellationToken);
            return long.TryParse(output.Trim(), out var size) ? size : 0;
        }
        catch
        {
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
        return name.EndsWith(".tar", StringComparison.OrdinalIgnoreCase)
            && name.StartsWith("modelibr-", StringComparison.OrdinalIgnoreCase);
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
