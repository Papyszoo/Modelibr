using System.Diagnostics;
using System.Formats.Tar;
using System.Text.Json;

namespace WebApi.Infrastructure;

/// <summary>
/// Runs before the host is built. If a .tar archive is present in the restore
/// directory, validates its manifest, then restores Postgres (pg_restore --clean)
/// and replaces the uploads/thumbnails trees. On success the archive is moved to
/// restore/processed/. On validation failure it is moved to restore/failed/ and
/// boot proceeds normally — never destroy live data because of a bad archive.
/// </summary>
public static class RestoreOnBootProcessor
{
    private const string ManifestEntryName = "manifest.json";
    private const string DatabaseDumpEntryName = "database.dump";
    private const string UploadsPrefix = "uploads/";
    private const string ThumbnailsPrefix = "thumbnails/";

    public static async Task RunAsync(IConfiguration configuration, ILogger logger)
    {
        var restoreRoot = configuration["RESTORE_STORAGE_PATH"] ?? "/var/lib/modelibr/restore";
        var uploadRoot = configuration["UPLOAD_STORAGE_PATH"] ?? "/var/lib/modelibr/uploads";
        var thumbnailRoot = configuration["THUMBNAIL_STORAGE_PATH"] ?? "/var/lib/modelibr/thumbnails";
        var processedDir = Path.Combine(restoreRoot, "processed");
        var failedDir = Path.Combine(restoreRoot, "failed");

        Directory.CreateDirectory(restoreRoot);
        Directory.CreateDirectory(processedDir);
        Directory.CreateDirectory(failedDir);

        // Clean up stale .pre-restore-* directories from any previous incomplete run.
        SweepStalePreRestoreDirs(uploadRoot, logger);
        SweepStalePreRestoreDirs(thumbnailRoot, logger);

        var archive = Directory.EnumerateFiles(restoreRoot, "*.tar")
            .OrderBy(f => f, StringComparer.Ordinal)
            .FirstOrDefault();
        if (archive == null) return;

        logger.LogInformation("Found staged restore archive {Archive}", archive);

        Manifest? manifest;
        try
        {
            manifest = ReadManifest(archive)
                ?? throw new InvalidOperationException("Archive does not contain manifest.json.");
        }
        catch (Exception ex)
        {
            await MoveToFailedAsync(archive, failedDir, $"Manifest read failed: {ex.Message}", logger);
            return;
        }

        if (manifest.PostgresMajorVersion != 16)
        {
            await MoveToFailedAsync(archive, failedDir,
                $"Backup Postgres major version {manifest.PostgresMajorVersion} does not match current 16.", logger);
            return;
        }

        var host = configuration["POSTGRES_HOST"] ?? "postgres";
        var port = int.TryParse(configuration["POSTGRES_PORT"], out var p) ? p : 5432;
        var db = configuration["POSTGRES_DB"] ?? "Modelibr";
        var user = configuration["POSTGRES_USER"] ?? "modelibr";
        var password = configuration["POSTGRES_PASSWORD"] ?? string.Empty;

        await WaitForPostgresAsync(host, port, user, password, db, logger);

        // Stage the existing uploads/thumbnails trees to .pre-restore-<ts>/ — preserved
        // until the entire restore succeeds so we can recover manually on failure.
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var uploadsPreRestore = StageExistingTree(uploadRoot, $".pre-restore-{stamp}", logger);
        var thumbnailsPreRestore = manifest.Scope.Thumbnails
            ? StageExistingTree(thumbnailRoot, $".pre-restore-{stamp}", logger)
            : null;

        var dumpPath = Path.Combine(restoreRoot, $".dump-{stamp}");
        try
        {
            ExtractArchive(archive, dumpPath, uploadRoot, thumbnailRoot, manifest, logger);

            await RunPgRestoreAsync(dumpPath, host, port, user, password, db, logger);

            // Success — drop the pre-restore copies.
            DeleteDirectoryQuiet(uploadsPreRestore, logger);
            if (thumbnailsPreRestore != null) DeleteDirectoryQuiet(thumbnailsPreRestore, logger);

            // Move the archive into processed/.
            var processedPath = Path.Combine(processedDir, $"{stamp}-{Path.GetFileName(archive)}");
            File.Move(archive, processedPath);
            logger.LogInformation("Restore completed successfully. Archive moved to {Path}", processedPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Restore failed. Pre-restore data preserved at {UploadsBackup}", uploadsPreRestore);
            await MoveToFailedAsync(archive, failedDir, $"Restore execution failed: {ex.Message}", logger);
            // Note: pre-restore-* directories are left in place so the operator can recover manually.
            throw;
        }
        finally
        {
            if (File.Exists(dumpPath))
            {
                try { File.Delete(dumpPath); }
                catch (IOException ex) { logger.LogWarning(ex, "Failed to delete temp dump {Path}", dumpPath); }
            }
        }
    }

    // ── private ─────────────────────────────────────────────────────────

    private static Manifest? ReadManifest(string tarPath)
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
                return JsonSerializer.Deserialize<Manifest>(ms);
            }
        }
        return null;
    }

    private static void ExtractArchive(
        string tarPath, string dumpOutputPath,
        string uploadRoot, string thumbnailRoot,
        Manifest manifest, ILogger logger)
    {
        using var fs = File.OpenRead(tarPath);
        using var reader = new TarReader(fs);
        TarEntry? entry;
        while ((entry = reader.GetNextEntry(copyData: true)) != null)
        {
            if (entry.EntryType is not (TarEntryType.RegularFile or TarEntryType.V7RegularFile)) continue;

            if (entry.Name == ManifestEntryName) continue; // already read

            if (entry.Name == DatabaseDumpEntryName)
            {
                using var outFs = File.Create(dumpOutputPath);
                entry.DataStream!.CopyTo(outFs);
                continue;
            }

            string? targetPath = null;
            if (entry.Name.StartsWith(UploadsPrefix, StringComparison.Ordinal))
            {
                var rel = entry.Name[UploadsPrefix.Length..];
                targetPath = SafeCombine(uploadRoot, rel);
            }
            else if (entry.Name.StartsWith(ThumbnailsPrefix, StringComparison.Ordinal) && manifest.Scope.Thumbnails)
            {
                var rel = entry.Name[ThumbnailsPrefix.Length..];
                targetPath = SafeCombine(thumbnailRoot, rel);
            }

            if (targetPath == null) continue;

            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
            using var outFs2 = File.Create(targetPath);
            entry.DataStream!.CopyTo(outFs2);
        }

        logger.LogInformation("Archive extracted to disk.");
    }

    private static string SafeCombine(string root, string relative)
    {
        // Defense against zip-slip: ensure the resolved path stays under root.
        var combined = Path.GetFullPath(Path.Combine(root, relative));
        var rootFull = Path.GetFullPath(root);
        if (!combined.StartsWith(rootFull + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            && combined != rootFull)
        {
            throw new InvalidOperationException($"Archive entry escapes root: {relative}");
        }
        return combined;
    }

    private static async Task RunPgRestoreAsync(
        string dumpPath, string host, int port, string user, string password, string db, ILogger logger)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "pg_restore",
            ArgumentList =
            {
                "--clean", "--if-exists",
                "--no-owner", "--no-privileges",
                "-h", host,
                "-p", port.ToString(),
                "-U", user,
                "-d", db,
                dumpPath,
            },
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
        };
        psi.Environment["PGPASSWORD"] = password;

        using var p = Process.Start(psi) ?? throw new InvalidOperationException("Failed to launch pg_restore.");
        var stderr = await p.StandardError.ReadToEndAsync();
        var stdout = await p.StandardOutput.ReadToEndAsync();
        await p.WaitForExitAsync();
        if (p.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"pg_restore exited with code {p.ExitCode}. stdout: {stdout}. stderr: {stderr}");
        }
        logger.LogInformation("pg_restore completed.");
    }

    private static async Task WaitForPostgresAsync(
        string host, int port, string user, string password, string db, ILogger logger)
    {
        for (var attempt = 1; attempt <= 30; attempt++)
        {
            var psi = new ProcessStartInfo
            {
                FileName = "pg_isready",
                ArgumentList = { "-h", host, "-p", port.ToString(), "-U", user, "-d", db },
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
            };
            psi.Environment["PGPASSWORD"] = password;
            try
            {
                using var p = Process.Start(psi);
                if (p != null)
                {
                    await p.WaitForExitAsync();
                    if (p.ExitCode == 0) return;
                }
            }
            catch
            {
                // try again
            }
            logger.LogInformation("Postgres not ready (attempt {Attempt}/30), retrying...", attempt);
            await Task.Delay(1000);
        }
        throw new InvalidOperationException("Postgres did not become ready within 30 seconds.");
    }

    private static string StageExistingTree(string root, string suffix, ILogger logger)
    {
        if (!Directory.Exists(root)) return Path.Combine(root, suffix);
        Directory.CreateDirectory(root);
        var stageDir = Path.Combine(root, suffix);
        Directory.CreateDirectory(stageDir);

        foreach (var entry in Directory.EnumerateFileSystemEntries(root))
        {
            var name = Path.GetFileName(entry);
            if (string.Equals(name, suffix, StringComparison.Ordinal)) continue;
            if (name.StartsWith(".pre-restore-", StringComparison.Ordinal)) continue; // already-staged dirs from this run
            try
            {
                Directory.Move(entry, Path.Combine(stageDir, name));
            }
            catch (IOException ex)
            {
                logger.LogWarning(ex, "Failed to stage {Entry}", entry);
            }
        }
        return stageDir;
    }

    private static void SweepStalePreRestoreDirs(string root, ILogger logger)
    {
        if (!Directory.Exists(root)) return;
        foreach (var dir in Directory.EnumerateDirectories(root, ".pre-restore-*"))
        {
            logger.LogInformation("Removing stale pre-restore directory {Dir}", dir);
            DeleteDirectoryQuiet(dir, logger);
        }
    }

    private static void DeleteDirectoryQuiet(string dir, ILogger logger)
    {
        try
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
        catch (IOException ex)
        {
            logger.LogWarning(ex, "Failed to delete {Dir}", dir);
        }
    }

    private static async Task MoveToFailedAsync(string archive, string failedDir, string reason, ILogger logger)
    {
        logger.LogError("Refusing to restore archive {Archive}: {Reason}", archive, reason);
        var target = Path.Combine(failedDir, Path.GetFileName(archive));
        try
        {
            if (File.Exists(target)) File.Delete(target);
            File.Move(archive, target);
            await File.WriteAllTextAsync(target + ".error.txt", reason);
        }
        catch (IOException ex)
        {
            logger.LogError(ex, "Failed to move archive to failed/");
        }
    }

    // ── manifest mirror (kept in sync with BackupService.BackupManifest) ─

    private sealed record Manifest(
        int ManifestVersion,
        DateTime CreatedAtUtc,
        int PostgresMajorVersion,
        ManifestScopeData Scope,
        ManifestStatsData Stats);

    private sealed record ManifestScopeData(bool Database, bool Uploads, bool Thumbnails);

    private sealed record ManifestStatsData(
        int UploadsCount,
        long UploadsBytes,
        int ThumbnailsCount,
        long ThumbnailsBytes,
        long DatabaseDumpBytes);
}
