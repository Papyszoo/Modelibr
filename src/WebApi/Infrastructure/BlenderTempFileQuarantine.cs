using System.Text.Json;
using Application.Abstractions.Storage;
using Microsoft.Extensions.Logging;

namespace WebApi.Infrastructure;

/// <summary>
/// Quarantines Blender Safe-Save temp files that could not be turned into a model
/// version, instead of deleting them. The whole point of Safe Save is that the bytes
/// the artist just saved must never disappear — if the WebDAV middleware can't resolve
/// or process a save, it moves the temp file (plus a JSON sidecar describing why) into
/// "{uploads}/webdav-blend-orphans/" so it can be recovered manually instead of quietly
/// vanishing. See webdav-patterns skill / prompt 30 for the data-safety rule this
/// implements.
/// </summary>
internal sealed class BlenderTempFileQuarantine
{
    private const string OrphanDirectoryName = "webdav-blend-orphans";

    private readonly IUploadPathProvider _pathProvider;
    private readonly ILogger _logger;

    public BlenderTempFileQuarantine(IUploadPathProvider pathProvider, ILogger logger)
    {
        _pathProvider = pathProvider;
        _logger = logger;
    }

    /// <summary>
    /// Moves the temp file at <paramref name="tempFilePath"/> into the orphan directory
    /// and writes a JSON sidecar with the original request path, timestamp, reason, and
    /// candidate model ids (when the failure was an ambiguous name match). No-ops (with
    /// a warning) if the temp file no longer exists — there are no bytes to protect.
    /// Deliberately takes no CancellationToken: quarantine is a data-safety operation,
    /// and a client that disconnects mid-failure (aborting the request) must not be
    /// able to cancel the move or the sidecar write.
    /// </summary>
    public async Task QuarantineAsync(
        string tempFilePath,
        string requestPath,
        string reason,
        IReadOnlyCollection<int>? candidateModelIds)
    {
        if (!File.Exists(tempFilePath))
        {
            _logger.LogWarning(
                "Blender temp file quarantine requested but no bytes exist at {TempPath} (reason={Reason})",
                tempFilePath, reason);
            return;
        }

        try
        {
            var orphanDir = Path.Combine(_pathProvider.UploadRootPath, OrphanDirectoryName);
            Directory.CreateDirectory(orphanDir);

            var timestampUtc = DateTime.UtcNow;
            var originalKey = Path.GetFileNameWithoutExtension(tempFilePath);
            var baseName = $"{timestampUtc:yyyyMMddTHHmmssfffZ}-{originalKey}";
            var orphanFilePath = Path.Combine(orphanDir, $"{baseName}.blend");
            var sidecarPath = Path.Combine(orphanDir, $"{baseName}.json");

            File.Move(tempFilePath, orphanFilePath, overwrite: true);

            var sidecar = new OrphanSidecar(
                requestPath,
                timestampUtc,
                reason,
                candidateModelIds ?? []);

            await File.WriteAllTextAsync(
                sidecarPath,
                JsonSerializer.Serialize(sidecar, SidecarJsonOptions),
                CancellationToken.None);

            _logger.LogWarning(
                "Quarantined unresolvable Blender save temp file to {OrphanPath} (reason={Reason}, requestPath={RequestPath})",
                orphanFilePath, reason, requestPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to quarantine Blender temp file {TempPath} (reason={Reason})", tempFilePath, reason);
        }
    }

    private static readonly JsonSerializerOptions SidecarJsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private sealed record OrphanSidecar(
        string OriginalRequestPath,
        DateTime TimestampUtc,
        string Reason,
        IReadOnlyCollection<int> CandidateModelIds);
}
