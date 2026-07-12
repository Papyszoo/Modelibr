using Application.Abstractions.Storage;
using Microsoft.Extensions.Logging;

namespace WebApi.Infrastructure;

/// <summary>
/// Outcome of a single <see cref="BlenderRetentionSweeper.SweepAsync"/> pass. Counts, not
/// items — the per-file detail is in the log lines emitted during the sweep.
/// </summary>
internal sealed record BlenderRetentionSweepResult(
    int TempQuarantined,
    int TempSkipped,
    int OrphansDeleted,
    int OrphansSkipped,
    int Errors);

/// <summary>
/// Bounded retention for the two directories the WebDAV Blender Safe-Save path leaves
/// behind under <c>{uploads}/</c>:
///
/// <list type="bullet">
/// <item><c>webdav-blend-temp/</c> — in-flight Safe-Save uploads, keyed by a hash of the
/// request path (<c>WebDavMiddleware.GetTempFileKey</c>). A file lingers here only if
/// Blender (or the connection) crashed mid-save before the MOVE that would either
/// process it or quarantine it.</item>
/// <item><c>webdav-blend-orphans/</c> — <see cref="BlenderTempFileQuarantine"/>'s landing
/// zone for saves that could not be resolved to a model. Each entry is a
/// <c>.blend</c> + <c>.json</c> sidecar pair.</item>
/// </list>
///
/// Data-safety rule (prompt 30, item 5): unprocessed user bytes are never deleted — only
/// quarantined. So aged-out temp files are moved into the orphans dir (via the same
/// <see cref="BlenderTempFileQuarantine"/> used by the live Safe-Save failure paths),
/// never deleted directly. This is a deliberate deviation from a naive ">24h ⇒ delete"
/// policy: it guarantees there is exactly one place bytes disappear from disk
/// (<see cref="SweepOrphansAsync"/>'s 30-day-old deletion), and that place only ever
/// touches files that already went through quarantine — i.e. the artist's original save
/// was already unresolvable, not merely slow to be picked up.
///
/// This class does the sweep logic only — no timer, no DI lifetime — so it can be unit
/// tested by constructing it directly and calling <see cref="SweepAsync"/> with an
/// explicit "now". <see cref="BlenderRetentionSweepHostedService"/> owns the schedule.
/// </summary>
internal sealed class BlenderRetentionSweeper
{
    /// <summary>
    /// Temp files older than this are presumed abandoned by a crashed Safe-Save and get
    /// quarantined (not deleted — see class remarks).
    /// </summary>
    internal static readonly TimeSpan TempFileMaxAge = TimeSpan.FromHours(24);

    /// <summary>
    /// Orphaned quarantine entries (temp bytes nobody claimed) older than this are
    /// deleted for real. This is the one place this sweeper removes bytes.
    /// </summary>
    internal static readonly TimeSpan OrphanMaxAge = TimeSpan.FromDays(30);

    internal const string TempAgedOutReason = "aged out of webdav-blend-temp";

    private const string TempDirectoryName = "webdav-blend-temp";
    private const string OrphanDirectoryName = "webdav-blend-orphans";

    private readonly IUploadPathProvider _pathProvider;
    private readonly BlenderTempFileQuarantine _quarantine;
    private readonly ILogger _logger;

    public BlenderRetentionSweeper(
        IUploadPathProvider pathProvider,
        BlenderTempFileQuarantine quarantine,
        ILogger logger)
    {
        _pathProvider = pathProvider;
        _quarantine = quarantine;
        _logger = logger;
    }

    /// <summary>
    /// Runs one sweep pass. Never throws — every per-file operation is individually
    /// guarded, and any unexpected top-level failure is caught and logged so a bad sweep
    /// can never take down the hosted service (and therefore the app).
    /// </summary>
    public async Task<BlenderRetentionSweepResult> SweepAsync(DateTime utcNow, CancellationToken cancellationToken)
    {
        int tempQuarantined = 0, tempSkipped = 0, orphansDeleted = 0, orphansSkipped = 0, errors = 0;

        try
        {
            (tempQuarantined, tempSkipped, var tempErrors) = await SweepTempAsync(utcNow, cancellationToken);
            errors += tempErrors;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "WebDAV retention sweep: unexpected failure sweeping {Directory}", TempDirectoryName);
            errors++;
        }

        try
        {
            (orphansDeleted, orphansSkipped, var orphanErrors) = SweepOrphans(utcNow);
            errors += orphanErrors;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "WebDAV retention sweep: unexpected failure sweeping {Directory}", OrphanDirectoryName);
            errors++;
        }

        var result = new BlenderRetentionSweepResult(tempQuarantined, tempSkipped, orphansDeleted, orphansSkipped, errors);

        _logger.LogInformation(
            "WebDAV retention sweep complete: {TempQuarantined} temp file(s) quarantined, " +
            "{TempSkipped} temp file(s) skipped (fresh), {OrphansDeleted} orphan file(s) deleted, " +
            "{OrphansSkipped} orphan file(s) skipped (fresh), {Errors} error(s)",
            result.TempQuarantined, result.TempSkipped, result.OrphansDeleted, result.OrphansSkipped, result.Errors);

        return result;
    }

    private async Task<(int quarantined, int skipped, int errors)> SweepTempAsync(DateTime utcNow, CancellationToken cancellationToken)
    {
        var tempDir = Path.Combine(_pathProvider.UploadRootPath, TempDirectoryName);
        if (!Directory.Exists(tempDir))
            return (0, 0, 0);

        int quarantined = 0, skipped = 0, errors = 0;

        // webdav-blend-temp is flat (files are keyed by GetTempFileKey, no subdirectories).
        foreach (var path in Directory.EnumerateFiles(tempDir))
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var age = utcNow - System.IO.File.GetLastWriteTimeUtc(path);
                if (age < TempFileMaxAge)
                {
                    skipped++;
                    continue;
                }

                var tempKey = Path.GetFileName(path);
                await _quarantine.QuarantineAsync(
                    path,
                    requestPath: $"(unknown — {TempAgedOutReason}; temp key {tempKey})",
                    reason: TempAgedOutReason,
                    candidateModelIds: null);
                quarantined++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "WebDAV retention sweep: failed to process temp file {Path}", path);
                errors++;
            }
        }

        return (quarantined, skipped, errors);
    }

    private (int deleted, int skipped, int errors) SweepOrphans(DateTime utcNow)
    {
        var orphanDir = Path.Combine(_pathProvider.UploadRootPath, OrphanDirectoryName);
        if (!Directory.Exists(orphanDir))
            return (0, 0, 0);

        int deleted = 0, skipped = 0, errors = 0;

        // Orphans are always written as a {baseName}.blend + {baseName}.json pair by
        // BlenderTempFileQuarantine. Group by base name so both halves of a pair age out
        // (and get deleted) together, keyed off the .blend file's timestamp — but also
        // clean up a stray sidecar left behind by a previous partial failure.
        var byBaseName = Directory.EnumerateFiles(orphanDir)
            .GroupBy(Path.GetFileNameWithoutExtension);

        foreach (var group in byBaseName)
        {
            var blendPath = group.FirstOrDefault(p => p.EndsWith(".blend", StringComparison.OrdinalIgnoreCase));
            var sidecarPath = group.FirstOrDefault(p => p.EndsWith(".json", StringComparison.OrdinalIgnoreCase));
            var referencePath = blendPath ?? sidecarPath;
            if (referencePath == null)
                continue;

            try
            {
                var age = utcNow - System.IO.File.GetLastWriteTimeUtc(referencePath);
                if (age < OrphanMaxAge)
                {
                    skipped += group.Count();
                    continue;
                }

                foreach (var path in group)
                {
                    System.IO.File.Delete(path);
                    deleted++;
                }

                _logger.LogInformation("WebDAV retention sweep: deleted aged-out orphan {BaseName} (>{MaxAgeDays}d old)",
                    group.Key, OrphanMaxAge.TotalDays);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "WebDAV retention sweep: failed to delete orphan group {BaseName}", group.Key);
                errors++;
            }
        }

        return (deleted, skipped, errors);
    }
}
