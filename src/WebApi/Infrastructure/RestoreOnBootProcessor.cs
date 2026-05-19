using System.Diagnostics;
using System.Formats.Tar;
using System.Security.Cryptography;
using System.Text.Json;
using Application.Abstractions.Services;

namespace WebApi.Infrastructure;

/// <summary>
/// Runs before the host is built. If a .tar archive is present in the restore
/// directory, performs a strict pre-flight validation (manifest version, app
/// schema compat, archive integrity, expected entries) BEFORE moving any live
/// data. If validation passes, stages existing uploads/thumbnails into
/// <c>.pre-restore-&lt;ts&gt;/</c>, extracts the archive, runs
/// <c>pg_restore --clean --if-exists --exit-on-error</c>, and only then moves
/// the archive to <c>restore/processed/</c>.
///
/// Invalid archives go to <c>restore/failed/</c> with an <c>.error.txt</c>
/// sibling — live data is never touched in that path.
///
/// <c>.pre-restore-*</c> directories are NEVER auto-swept: a failed restore
/// leaves the operator's only recovery copy on disk, and silently deleting
/// it on the next boot would cause permanent data loss.
/// </summary>
public static class RestoreOnBootProcessor
{
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

        // Surface stale .pre-restore-* directories (left by a previous failed
        // restore). We do NOT delete them automatically — they are the only
        // recovery copy of the operator's live data and must be removed manually.
        WarnAboutStalePreRestoreDirs(uploadRoot, logger);
        WarnAboutStalePreRestoreDirs(thumbnailRoot, logger);

        var archive = Directory.EnumerateFiles(restoreRoot, "*.tar")
            .OrderBy(f => f, StringComparer.Ordinal)
            .FirstOrDefault();
        if (archive == null) return;

        // Refuse to run a second restore on top of an unrecovered pre-restore dir.
        // If those still exist, an operator hasn't finished cleaning up the previous
        // failure — running another restore now would shadow the recovery copy.
        if (HasStalePreRestoreDirs(uploadRoot) || HasStalePreRestoreDirs(thumbnailRoot))
        {
            await MoveToFailedAsync(archive, failedDir,
                "Refusing to restore: .pre-restore-* directories from a previous run still exist. " +
                "Either delete them manually after confirming live data is intact, or move them back " +
                "into place to recover.",
                logger);
            return;
        }

        logger.LogInformation("Found staged restore archive {Archive}", archive);

        // ── Phase 1: validate the archive BEFORE touching live data ────────

        BackupManifest? manifest;
        string? archiveValidationError = null;
        try
        {
            manifest = ReadManifest(archive);
            if (manifest == null)
            {
                archiveValidationError = "Archive does not contain manifest.json.";
            }
            else if (manifest.ManifestVersion != BackupManifestConstants.CurrentManifestVersion)
            {
                archiveValidationError =
                    $"Backup ManifestVersion {manifest.ManifestVersion} is incompatible with this " +
                    $"app's expected version {BackupManifestConstants.CurrentManifestVersion}.";
            }
            else if (!manifest.Scope.Database)
            {
                archiveValidationError = "Manifest claims no database — refusing to restore.";
            }
            else
            {
                // Confirm the archive structurally has what the manifest promised
                // before we let any pg_restore or file-tree mutation happen.
                var entryNames = EnumerateEntryNames(archive).ToHashSet(StringComparer.Ordinal);
                if (!entryNames.Contains(BackupServiceConstants.DatabaseDumpEntryName))
                {
                    archiveValidationError = "Archive is missing the database.dump entry.";
                }
                else
                {
                    var uploadEntries = entryNames.Count(n =>
                        n.StartsWith(BackupServiceConstants.UploadsPrefix, StringComparison.Ordinal));
                    if (uploadEntries != manifest.Stats.UploadsCount)
                    {
                        archiveValidationError =
                            $"Archive integrity check failed: manifest says {manifest.Stats.UploadsCount} upload " +
                            $"entries but tar contains {uploadEntries}. Refusing to restore — backup is truncated.";
                    }
                }
            }
        }
        catch (Exception ex)
        {
            archiveValidationError = $"Manifest read failed: {ex.Message}";
            manifest = null;
        }

        if (archiveValidationError != null || manifest == null)
        {
            await MoveToFailedAsync(archive, failedDir,
                archiveValidationError ?? "Unknown validation failure", logger);
            return;
        }

        // ── Phase 2: connect to Postgres and verify versions ──────────────

        var host = configuration["POSTGRES_HOST"] ?? "postgres";
        var port = int.TryParse(configuration["POSTGRES_PORT"], out var p) ? p : 5432;
        var db = configuration["POSTGRES_DB"] ?? "Modelibr";
        var user = configuration["POSTGRES_USER"] ?? "modelibr";
        var password = configuration["POSTGRES_PASSWORD"] ?? string.Empty;

        await WaitForPostgresAsync(host, port, user, password, db, logger);
        var liveMajor = await GetPostgresMajorVersionAsync(host, port, user, password, db);
        if (liveMajor != manifest.PostgresMajorVersion)
        {
            await MoveToFailedAsync(archive, failedDir,
                $"Postgres major version mismatch: archive was made under PG {manifest.PostgresMajorVersion} " +
                $"but the running server reports PG {liveMajor}. Restore aborted — live data untouched.",
                logger);
            return;
        }

        // ── Phase 3: extract dump to a temp file and verify its SHA-256 ───
        // The dump bytes are read out of the tar BEFORE any live tree is moved.
        // If the archive is truncated mid-dump, we abort while live data is intact.

        var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var dumpPath = Path.Combine(restoreRoot, $".dump-{stamp}");
        try
        {
            ExtractDatabaseDumpOnly(archive, dumpPath, logger);

            var actualSha = await ComputeSha256Async(dumpPath);
            if (!string.Equals(actualSha, manifest.Stats.DatabaseDumpSha256, StringComparison.OrdinalIgnoreCase))
            {
                await MoveToFailedAsync(archive, failedDir,
                    $"database.dump SHA-256 mismatch — expected {manifest.Stats.DatabaseDumpSha256}, got {actualSha}. " +
                    "Archive is corrupted. Live data untouched.",
                    logger);
                return;
            }

            // ── Phase 4: stage existing trees and extract uploads/thumbnails ──
            // Past this point we ARE touching live data. Any failure leaves
            // pre-restore copies behind for manual recovery.

            var uploadsPreRestore = StageExistingTreeStrict(uploadRoot, $".pre-restore-{stamp}", logger);
            var thumbnailsPreRestore = manifest.Scope.Thumbnails
                ? StageExistingTreeStrict(thumbnailRoot, $".pre-restore-{stamp}", logger)
                : null;

            var (extractedUploads, extractedThumbnails) =
                ExtractDataEntries(archive, uploadRoot, thumbnailRoot, manifest);

            if (extractedUploads != manifest.Stats.UploadsCount)
            {
                throw new InvalidOperationException(
                    $"Extracted {extractedUploads} upload files but manifest expected {manifest.Stats.UploadsCount}. " +
                    $"Pre-restore copy preserved at {uploadsPreRestore}.");
            }
            if (manifest.Scope.Thumbnails && extractedThumbnails != manifest.Stats.ThumbnailsCount)
            {
                throw new InvalidOperationException(
                    $"Extracted {extractedThumbnails} thumbnail files but manifest expected " +
                    $"{manifest.Stats.ThumbnailsCount}. Pre-restore copy preserved at {thumbnailsPreRestore}.");
            }

            // ── Phase 5: pg_restore with --exit-on-error so exit 1 is fatal ──
            await RunPgRestoreAsync(dumpPath, host, port, user, password, db, logger);

            // Success — drop the pre-restore copies and move the archive aside.
            DeleteDirectoryQuiet(uploadsPreRestore, logger);
            if (thumbnailsPreRestore != null) DeleteDirectoryQuiet(thumbnailsPreRestore, logger);

            var processedPath = Path.Combine(processedDir, $"{stamp}-{Path.GetFileName(archive)}");
            File.Move(archive, processedPath);
            logger.LogInformation("Restore completed successfully. Archive moved to {Path}", processedPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Restore execution failed.");
            // Guarantee the archive leaves the staging directory even if MoveToFailed
            // itself errors — otherwise the next boot retries the same broken archive
            // and locks the container in a crash loop.
            await EnsureArchiveOutOfStagingAsync(archive, failedDir, $"Restore execution failed: {ex.Message}", logger);
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

    private static BackupManifest? ReadManifest(string tarPath)
    {
        using var fs = File.OpenRead(tarPath);
        using var reader = new TarReader(fs);
        TarEntry? entry;
        while ((entry = reader.GetNextEntry(copyData: true)) != null)
        {
            if (entry.Name == BackupServiceConstants.ManifestEntryName && entry.DataStream != null)
            {
                using var ms = new MemoryStream();
                entry.DataStream.CopyTo(ms);
                ms.Position = 0;
                return JsonSerializer.Deserialize<BackupManifest>(ms);
            }
        }
        return null;
    }

    private static IEnumerable<string> EnumerateEntryNames(string tarPath)
    {
        using var fs = File.OpenRead(tarPath);
        using var reader = new TarReader(fs);
        TarEntry? entry;
        while ((entry = reader.GetNextEntry(copyData: false)) != null)
        {
            yield return entry.Name;
        }
    }

    private static void ExtractDatabaseDumpOnly(string tarPath, string dumpOutputPath, ILogger logger)
    {
        using var fs = File.OpenRead(tarPath);
        using var reader = new TarReader(fs);
        TarEntry? entry;
        while ((entry = reader.GetNextEntry(copyData: true)) != null)
        {
            if (entry.Name == BackupServiceConstants.DatabaseDumpEntryName && entry.DataStream != null)
            {
                using var outFs = File.Create(dumpOutputPath);
                entry.DataStream.CopyTo(outFs);
                outFs.Flush(flushToDisk: true);
                return;
            }
        }
        throw new InvalidOperationException("Archive did not contain database.dump (pre-validation should have caught this).");
    }

    private static (int uploads, int thumbnails) ExtractDataEntries(
        string tarPath,
        string uploadRoot,
        string thumbnailRoot,
        BackupManifest manifest)
    {
        var uploads = 0;
        var thumbnails = 0;

        using var fs = File.OpenRead(tarPath);
        using var reader = new TarReader(fs);
        TarEntry? entry;
        while ((entry = reader.GetNextEntry(copyData: true)) != null)
        {
            if (entry.EntryType is not (TarEntryType.RegularFile or TarEntryType.V7RegularFile)) continue;
            if (entry.Name == BackupServiceConstants.ManifestEntryName) continue;
            if (entry.Name == BackupServiceConstants.DatabaseDumpEntryName) continue;

            string? targetPath = null;
            if (entry.Name.StartsWith(BackupServiceConstants.UploadsPrefix, StringComparison.Ordinal))
            {
                var rel = entry.Name[BackupServiceConstants.UploadsPrefix.Length..];
                targetPath = SafeCombine(uploadRoot, rel);
                uploads++;
            }
            else if (entry.Name.StartsWith(BackupServiceConstants.ThumbnailsPrefix, StringComparison.Ordinal)
                     && manifest.Scope.Thumbnails)
            {
                var rel = entry.Name[BackupServiceConstants.ThumbnailsPrefix.Length..];
                targetPath = SafeCombine(thumbnailRoot, rel);
                thumbnails++;
            }

            if (targetPath == null) continue;

            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
            using var outFs = File.Create(targetPath);
            entry.DataStream!.CopyTo(outFs);
        }

        return (uploads, thumbnails);
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
                "--exit-on-error", // bail on the first real failure rather than continuing past errors
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
            // With --exit-on-error in place, any non-zero exit means a real failure
            // (not a benign "object did not exist" warning suppressed by --if-exists).
            throw new InvalidOperationException(
                $"pg_restore exited with code {p.ExitCode}. stdout: {stdout}. stderr: {stderr}");
        }
        logger.LogInformation("pg_restore completed successfully.");
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

    private static async Task<int> GetPostgresMajorVersionAsync(
        string host, int port, string user, string password, string db)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "psql",
            ArgumentList =
            {
                "-h", host,
                "-p", port.ToString(),
                "-U", user,
                "-d", db,
                "-t", "-A",
                "-c", "SHOW server_version_num",
            },
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.Environment["PGPASSWORD"] = password;

        using var p = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to launch psql for version probe.");
        var output = (await p.StandardOutput.ReadToEndAsync()).Trim();
        await p.WaitForExitAsync();
        if (p.ExitCode != 0 || !int.TryParse(output, out var verNum))
        {
            throw new InvalidOperationException($"Failed to read postgres version (exit {p.ExitCode}): '{output}'");
        }
        return verNum / 10000;
    }

    /// <summary>
    /// Moves every direct entry of <paramref name="root"/> into a sibling
    /// <c>{root}/{suffix}</c> directory. Throws if ANY entry cannot be moved —
    /// a partial stage would leave live files mixed with restored files after
    /// extraction, producing silent inconsistency.
    /// </summary>
    private static string StageExistingTreeStrict(string root, string suffix, ILogger logger)
    {
        Directory.CreateDirectory(root);
        var stageDir = Path.Combine(root, suffix);
        Directory.CreateDirectory(stageDir);

        foreach (var entry in Directory.EnumerateFileSystemEntries(root))
        {
            var name = Path.GetFileName(entry);
            if (string.Equals(name, suffix, StringComparison.Ordinal)) continue;
            if (name.StartsWith(".pre-restore-", StringComparison.Ordinal)) continue;
            try
            {
                Directory.Move(entry, Path.Combine(stageDir, name));
            }
            catch (IOException ex)
            {
                throw new InvalidOperationException(
                    $"Failed to stage live entry {entry} into {stageDir}. The restore has been aborted " +
                    "with live data still in place — fix the cause and retry.", ex);
            }
        }
        logger.LogInformation("Staged existing tree from {Root} into {StageDir}", root, stageDir);
        return stageDir;
    }

    private static bool HasStalePreRestoreDirs(string root)
    {
        if (!Directory.Exists(root)) return false;
        return Directory.EnumerateDirectories(root, ".pre-restore-*").Any();
    }

    private static void WarnAboutStalePreRestoreDirs(string root, ILogger logger)
    {
        if (!Directory.Exists(root)) return;
        foreach (var dir in Directory.EnumerateDirectories(root, ".pre-restore-*"))
        {
            logger.LogWarning(
                "Pre-restore directory {Dir} still exists from a previous failed restore. " +
                "It holds the only on-disk copy of your live data from that point. Delete it " +
                "manually after confirming the current tree is intact.",
                dir);
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

    private static async Task<string> ComputeSha256Async(string filePath)
    {
        await using var fs = File.OpenRead(filePath);
        using var sha = SHA256.Create();
        var hash = await sha.ComputeHashAsync(fs);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static async Task MoveToFailedAsync(string archive, string failedDir, string reason, ILogger logger)
    {
        logger.LogError("Refusing to restore archive {Archive}: {Reason}", archive, reason);
        await EnsureArchiveOutOfStagingAsync(archive, failedDir, reason, logger);
    }

    /// <summary>
    /// Guarantees the archive does NOT remain at its current path. The primary
    /// strategy is moving it to <paramref name="failedDir"/>. If that fails, the
    /// fallback renames it with a <c>.invalid</c> suffix in place, so the next
    /// boot's <c>*.tar</c> glob ignores it and the container doesn't crash-loop.
    /// </summary>
    private static async Task EnsureArchiveOutOfStagingAsync(
        string archive, string failedDir, string reason, ILogger logger)
    {
        if (!File.Exists(archive)) return;

        var fileName = Path.GetFileName(archive);
        var target = Path.Combine(failedDir, fileName);
        try
        {
            Directory.CreateDirectory(failedDir);
            if (File.Exists(target)) File.Delete(target);
            File.Move(archive, target);
            await File.WriteAllTextAsync(target + ".error.txt", reason);
            return;
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Could not move archive to failed/. Falling back to in-place rename so it is not retried on next boot.");
        }

        // Fallback: rename in place with a non-.tar extension so the next boot
        // skips it. Crash-loop prevention is the priority here.
        try
        {
            var renamed = archive + ".invalid";
            if (File.Exists(renamed)) File.Delete(renamed);
            File.Move(archive, renamed);
            try { await File.WriteAllTextAsync(renamed + ".error.txt", reason); } catch { /* swallow */ }
        }
        catch (Exception ex)
        {
            logger.LogCritical(ex,
                "Could not rename failed archive in place. Manual cleanup required: delete {Archive} or move it to {FailedDir}.",
                archive, failedDir);
            // We deliberately do not throw — the original failure (which the caller
            // is about to re-throw) is the real issue. This is best-effort cleanup.
        }
    }
}

internal static class BackupServiceConstants
{
    public const string ManifestEntryName = "manifest.json";
    public const string DatabaseDumpEntryName = "database.dump";
    public const string UploadsPrefix = "uploads/";
    public const string ThumbnailsPrefix = "thumbnails/";
}
