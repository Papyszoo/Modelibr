using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.RecycledFiles;
using Application.Settings;
using Microsoft.Extensions.Logging;

namespace WebApi.Infrastructure;

/// <summary>
/// Permanently deletes recycled items older than the configured retention.
///
/// It deletes through <see cref="PermanentDeleteEntityCommand"/> - the exact
/// command the manual "delete forever" button sends - so the purge and the
/// button can never diverge in what they remove. The list of what is eligible
/// comes from the recycle bin's own query, so the purge only ever acts on items
/// the bin shows.
///
/// Retention is <c>CleanRecycledFilesAfterDays</c> from the Settings table:
/// absent or 0 means never, and the job does nothing. That default is
/// deliberate - an upgrade must never start deleting user data on its own.
/// </summary>
public sealed class RecycledFilePurgeService
{
    private readonly ISettingRepository _settingRepository;
    private readonly IQueryHandler<GetAllRecycledQuery, GetAllRecycledQueryResponse> _recycledQuery;
    private readonly ICommandHandler<PermanentDeleteEntityCommand, PermanentDeleteEntityResponse> _permanentDelete;
    private readonly IFileRepository _fileRepository;
    private readonly ILogger<RecycledFilePurgeService> _logger;

    public RecycledFilePurgeService(
        ISettingRepository settingRepository,
        IQueryHandler<GetAllRecycledQuery, GetAllRecycledQueryResponse> recycledQuery,
        ICommandHandler<PermanentDeleteEntityCommand, PermanentDeleteEntityResponse> permanentDelete,
        IFileRepository fileRepository,
        ILogger<RecycledFilePurgeService> logger)
    {
        _settingRepository = settingRepository ?? throw new ArgumentNullException(nameof(settingRepository));
        _recycledQuery = recycledQuery ?? throw new ArgumentNullException(nameof(recycledQuery));
        _permanentDelete = permanentDelete ?? throw new ArgumentNullException(nameof(permanentDelete));
        _fileRepository = fileRepository ?? throw new ArgumentNullException(nameof(fileRepository));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>Purges items deleted before <paramref name="utcNow"/> minus the retention. Returns how many were removed.</summary>
    public async Task<int> PurgeAsync(DateTime utcNow, CancellationToken cancellationToken = default)
    {
        var retentionSetting = await _settingRepository.GetByKeyAsync(
            SettingKeys.CleanRecycledFilesAfterDays, cancellationToken);
        var retentionDays = SettingResolution.ParseNonNegativeInt(retentionSetting?.Value);

        if (retentionDays is null or 0)
        {
            _logger.LogDebug("Recycled-file purge skipped: retention is 'never'.");
            return 0;
        }

        var cutoff = utcNow.AddDays(-retentionDays.Value);

        var listResult = await _recycledQuery.Handle(new GetAllRecycledQuery(), cancellationToken);
        if (listResult.IsFailure)
        {
            _logger.LogWarning(
                "Recycled-file purge could not list recycled items: {Error}",
                listResult.Error.Message);
            return 0;
        }

        var recycled = listResult.Value;
        var eligibleModels = recycled.Models.Where(m => m.DeletedAt < cutoff).ToList();
        var eligibleModelIds = eligibleModels.Select(m => m.Id).ToHashSet();
        var eligibleEnvironmentMaps = recycled.EnvironmentMaps.Where(e => e.DeletedAt < cutoff).ToList();
        var eligibleEnvironmentMapIds = eligibleEnvironmentMaps.Select(e => e.Id).ToHashSet();

        var purged = 0;

        // Parents first: purging a model / texture set / environment map removes
        // the children it owns, so the loops below only handle children whose
        // parent is staying (their deletion was independent of the parent's).
        foreach (var model in eligibleModels)
        {
            purged += await TryPurgeAsync("model", model.Id, cancellationToken);
        }

        foreach (var textureSet in recycled.TextureSets.Where(t => t.DeletedAt < cutoff))
        {
            purged += await TryPurgeAsync("textureset", textureSet.Id, cancellationToken);
        }

        foreach (var sprite in recycled.Sprites.Where(s => s.DeletedAt < cutoff))
        {
            purged += await TryPurgeAsync("sprite", sprite.Id, cancellationToken);
        }

        foreach (var sound in recycled.Sounds.Where(s => s.DeletedAt < cutoff))
        {
            purged += await TryPurgeAsync("sound", sound.Id, cancellationToken);
        }

        foreach (var script in recycled.Scripts.Where(s => s.DeletedAt < cutoff))
        {
            purged += await TryPurgeAsync("script", script.Id, cancellationToken);
        }

        foreach (var environmentMap in eligibleEnvironmentMaps)
        {
            purged += await TryPurgeAsync("environmentmap", environmentMap.Id, cancellationToken);
        }

        foreach (var material in recycled.Materials.Where(m => m.DeletedAt < cutoff))
        {
            purged += await TryPurgeAsync("material", material.Id, cancellationToken);
        }

        // Children of an eligible parent are already gone above; only versions
        // and variants whose parent is staying get their own dispatch.
        foreach (var version in recycled.ModelVersions.Where(
                     v => v.DeletedAt < cutoff && !eligibleModelIds.Contains(v.ModelId)))
        {
            purged += await TryPurgeAsync("modelversion", version.Id, cancellationToken);
        }

        foreach (var variant in recycled.EnvironmentMapVariants.Where(
                     v => v.DeletedAt < cutoff && !eligibleEnvironmentMapIds.Contains(v.EnvironmentMapId)))
        {
            purged += await TryPurgeAsync("environmentmapvariant", variant.Id, cancellationToken);
        }

        // Plain file rows last, and only when nothing live still uses the bytes.
        // The manual delete-forever path removes a file unconditionally because a
        // person chose that row; an automatic purge must not take the bytes out
        // from under an asset that shares the same content hash.
        foreach (var file in recycled.Files.Where(f => f.DeletedAt < cutoff))
        {
            if (await _fileRepository.IsFileHashReferencedByOthersAsync(file.Id, cancellationToken))
            {
                _logger.LogDebug(
                    "Keeping recycled file {FileId} ({FileName}): still referenced by a live asset.",
                    file.Id, file.OriginalFileName);
                continue;
            }

            purged += await TryPurgeAsync("file", file.Id, cancellationToken);
        }

        if (purged > 0)
        {
            _logger.LogInformation(
                "Purged {Count} recycled item(s) older than {Days} day(s).",
                purged, retentionDays.Value);
        }

        return purged;
    }

    private async Task<int> TryPurgeAsync(string entityType, int entityId, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _permanentDelete.Handle(
                new PermanentDeleteEntityCommand(entityType, entityId), cancellationToken);

            if (result.IsSuccess)
            {
                return 1;
            }

            // Usually "already gone" - e.g. a file the parent's purge removed.
            _logger.LogInformation(
                "Skipped purging {EntityType} {EntityId}: {Error}",
                entityType, entityId, result.Error.Message);
            return 0;
        }
        catch (Exception ex)
        {
            // One bad item must not stop the sweep; the next one retries it.
            _logger.LogWarning(
                ex,
                "Failed to purge {EntityType} {EntityId}; it will be retried on the next sweep.",
                entityType, entityId);
            return 0;
        }
    }
}
