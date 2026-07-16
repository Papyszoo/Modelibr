using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Files;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;

namespace Application.StoreImports;

/// <summary>
/// Per-item outcome recorded in the job's result log and used for the counters.
/// </summary>
public sealed record StoreImportItemResult(string ItemType, string Name, string Outcome, string? Reason);

internal sealed class StoreImportProcessor : IStoreImportProcessor
{
    // Outcome constants (also the values serialized into the job result log).
    private const string OutcomeCreated = "created";
    private const string OutcomeSkippedDedupe = "skipped-dedupe";
    private const string OutcomeSkippedUnsupported = "skipped-unsupported";
    private const string OutcomeFailed = "failed";

    private readonly IStoreImportClient _client;
    private readonly IStoreImportSink _sink;
    private readonly IStoreImportJobRepository _jobRepository;
    private readonly IPackRepository _packRepository;
    private readonly IModelRepository _modelRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileUtilityService _fileUtilityService;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IStoreImportProgressNotifier _notifier;
    private readonly ILogger<StoreImportProcessor> _logger;

    public StoreImportProcessor(
        IStoreImportClient client,
        IStoreImportSink sink,
        IStoreImportJobRepository jobRepository,
        IPackRepository packRepository,
        IModelRepository modelRepository,
        ITextureSetRepository textureSetRepository,
        ISoundRepository soundRepository,
        ISpriteRepository spriteRepository,
        IEnvironmentMapRepository environmentMapRepository,
        IFileUtilityService fileUtilityService,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork,
        IStoreImportProgressNotifier notifier,
        ILogger<StoreImportProcessor> logger)
    {
        _client = client;
        _sink = sink;
        _jobRepository = jobRepository;
        _packRepository = packRepository;
        _modelRepository = modelRepository;
        _textureSetRepository = textureSetRepository;
        _soundRepository = soundRepository;
        _spriteRepository = spriteRepository;
        _environmentMapRepository = environmentMapRepository;
        _fileUtilityService = fileUtilityService;
        _clock = clock;
        _unitOfWork = unitOfWork;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task ProcessAsync(StoreImportWorkItem work, CancellationToken cancellationToken)
    {
        var job = await _jobRepository.GetByIdAsync(work.JobId, cancellationToken);
        if (job is null)
        {
            _logger.LogWarning("Store import job {JobId} not found; skipping", work.JobId);
            return;
        }

        try
        {
            job.MarkRunning(_clock.UtcNow);
            await SaveJobAsync(job, cancellationToken);
            await NotifyAsync(job, 0, null, "Fetching manifest", cancellationToken);

            var manifest = await _client.FetchManifestAsync(work.StoreUrl, work.AssetId, work.ImportToken, cancellationToken);
            var items = manifest.Items ?? Array.Empty<StoreManifestItem>();

            job.SetManifestVersion(manifest.SchemaVersion, _clock.UtcNow);
            job.SetItemTotal(items.Count, _clock.UtcNow);
            await SaveJobAsync(job, cancellationToken);

            var packId = await ResolvePackAsync(work, manifest, cancellationToken);
            job.SetPack(packId, _clock.UtcNow);
            await SaveJobAsync(job, cancellationToken);

            await TryAttachPackThumbnailAsync(work, manifest, packId, cancellationToken);

            var tags = (manifest.Tags ?? Array.Empty<string>())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .ToArray();

            var results = new List<StoreImportItemResult>(items.Count);
            int created = 0, skipped = 0, failed = 0, processed = 0;

            foreach (var item in items)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await NotifyAsync(job, processed, item.Name, $"Importing {item.ItemType}", cancellationToken, created, skipped, failed);

                StoreImportItemResult outcome;
                try
                {
                    outcome = await ImportItemAsync(work, packId, item, tags, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (StoreImportException ex)
                {
                    outcome = new StoreImportItemResult(item.ItemType, item.Name, OutcomeFailed, ex.Message);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Store import: item '{Item}' ({ItemType}) failed", item.Name, item.ItemType);
                    outcome = new StoreImportItemResult(item.ItemType, item.Name, OutcomeFailed, ex.Message);
                }

                results.Add(outcome);
                processed++;
                switch (outcome.Outcome)
                {
                    case OutcomeCreated: created++; break;
                    case OutcomeFailed: failed++; break;
                    default: skipped++; break;
                }
            }

            job.Complete(created, skipped, failed, Serialize(results), _clock.UtcNow);
            await SaveJobAsync(job, cancellationToken);
            await NotifyAsync(job, processed, null, "Import complete", cancellationToken, created, skipped, failed);
        }
        catch (OperationCanceledException)
        {
            // Host shutdown / cancellation: leave the job as-is. It is re-runnable and will
            // gap-fill via provenance + SHA dedupe on the next run.
            _logger.LogInformation("Store import job {JobId} was cancelled", work.JobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Store import job {JobId} aborted", work.JobId);
            try
            {
                job.Fail(ex.Message, _clock.UtcNow);
                await SaveJobAsync(job, CancellationToken.None);
                await NotifyAsync(job, 0, null, $"Import failed: {ex.Message}", CancellationToken.None);
            }
            catch (Exception persistEx)
            {
                _logger.LogError(persistEx, "Failed to persist failure state for store import job {JobId}", work.JobId);
            }
        }
    }

    private async Task<int> ResolvePackAsync(StoreImportWorkItem work, StoreManifest manifest, CancellationToken ct)
    {
        // Provenance idempotency: a re-import of the same store asset reuses its pack
        // (no second pack) and re-stamps the manifest version/timestamp for this run.
        var existing = await _packRepository.GetByStoreImportAsync(work.StoreUrl, work.AssetId, ct);
        if (existing != null)
        {
            await _sink.RecordPackProvenanceAsync(existing.Id, work.StoreUrl, work.AssetId, manifest.SchemaVersion, ct);
            return existing.Id;
        }

        var listingUrl = BuildListingUrl(work.StoreUrl, work.AssetId);
        var baseName = string.IsNullOrWhiteSpace(manifest.Title) ? $"Imported pack {work.AssetId}" : manifest.Title!.Trim();
        var license = StoreManifestMapping.MapLicense(manifest.License);

        var packId = await CreatePackWithUniqueNameAsync(baseName, manifest.Description, license, listingUrl, ct);
        await _sink.RecordPackProvenanceAsync(packId, work.StoreUrl, work.AssetId, manifest.SchemaVersion, ct);
        return packId;
    }

    // A pack name collision with an UNRELATED existing pack must not dead-end the import
    // (provenance already prevents re-import collisions). Disambiguate with a bounded suffix.
    private async Task<int> CreatePackWithUniqueNameAsync(string baseName, string? description, string? license, string url, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 25; attempt++)
        {
            var name = attempt == 0 ? baseName : $"{baseName} ({attempt + 1})";
            try
            {
                return await _sink.CreatePackAsync(name, description, license, url, ct);
            }
            catch (StoreImportException ex) when (ex.Message.Contains("PackAlreadyExists", StringComparison.Ordinal))
            {
                // try the next suffix
            }
        }

        throw new StoreImportException($"Could not create a uniquely named pack for '{baseName}'.");
    }

    private async Task TryAttachPackThumbnailAsync(StoreImportWorkItem work, StoreManifest manifest, int packId, CancellationToken ct)
    {
        var preview = manifest.Previews?.FirstOrDefault();
        if (preview is null || string.IsNullOrWhiteSpace(preview.Url))
            return;

        try
        {
            // Previews carry no manifest size; 0 lets the client apply its absolute cap.
            var bytes = await _client.DownloadFileAsync(work.StoreUrl, preview.Url, work.ImportToken, 0, ct);
            var upload = new InMemoryFileUpload(preview.FileName, bytes, preview.ContentType);
            await _sink.SetPackThumbnailFromFileAsync(packId, upload, ct);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Best-effort: a missing/failed pack thumbnail must not fail the import.
            _logger.LogWarning(ex, "Store import: failed to attach pack thumbnail for pack {PackId}", packId);
        }
    }

    private async Task<StoreImportItemResult> ImportItemAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, string[] tags, CancellationToken ct)
    {
        var target = StoreManifestMapping.PlanForItem(item.ItemType);
        if (target == StoreManifestMapping.ImportTarget.Unsupported)
        {
            // GAP (docs/VISION.md): PackItemType.Other has no Modelibr home — skip + report.
            return Skipped(item, OutcomeSkippedUnsupported, $"Unsupported item type '{item.ItemType}' — no Modelibr mapping.");
        }

        var files = item.Files ?? Array.Empty<StoreManifestFile>();
        if (files.Count == 0)
            throw new StoreImportException("Item has no files.");

        return target switch
        {
            StoreManifestMapping.ImportTarget.Model => await ImportModelAsync(work, packId, item, files, tags, ct),
            StoreManifestMapping.ImportTarget.TextureSet => await ImportTextureSetAsync(work, packId, item, files, tags, ct),
            StoreManifestMapping.ImportTarget.Sound => await ImportSoundAsync(work, packId, item, files[0], ct),
            StoreManifestMapping.ImportTarget.Sprite => await ImportSpriteAsync(work, packId, item, files[0], ct),
            StoreManifestMapping.ImportTarget.EnvironmentMap => await ImportEnvironmentMapAsync(work, packId, item, files[0], ct),
            _ => Skipped(item, OutcomeSkippedUnsupported, $"Unsupported item type '{item.ItemType}'.")
        };
    }

    private async Task<StoreImportItemResult> ImportModelAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, IReadOnlyList<StoreManifestFile> files, string[] tags, CancellationToken ct)
    {
        var meshes = files.Where(f => StoreManifestMapping.ParseRole(f.Role).Kind == StoreManifestMapping.RoleKind.Mesh).ToList();
        var primary = meshes.FirstOrDefault() ?? files[0];

        // SHA dedupe: if a model already exists for the primary file hash, link it — no download.
        var existing = await _modelRepository.GetByFileHashAsync(primary.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddModelToPackAsync(packId, existing.Id, ct);
            return Skipped(item, OutcomeSkippedDedupe, "Model already present (deduplicated by SHA-256).");
        }

        var primaryBytes = await DownloadAndVerifyAsync(work, primary, ct);
        var modelId = await _sink.CreateModelAsync(new InMemoryFileUpload(primary.FileName, primaryBytes), item.Name, ct);

        foreach (var file in files)
        {
            if (ReferenceEquals(file, primary))
                continue;
            var bytes = await DownloadAndVerifyAsync(work, file, ct);
            await _sink.AddFileToModelAsync(modelId, new InMemoryFileUpload(file.FileName, bytes), ct);
        }

        // Tags (+ item name reused as description) mirror the CLI: applied only when the
        // manifest carries tags. Models/texture sets are the only per-type tag vocabularies.
        if (tags.Length > 0)
            await _sink.SetModelTagsAsync(modelId, tags, item.Name, ct);

        await _sink.AddModelToPackAsync(packId, modelId, ct);
        return Created(item);
    }

    private async Task<StoreImportItemResult> ImportTextureSetAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, IReadOnlyList<StoreManifestFile> files, string[] tags, CancellationToken ct)
    {
        var first = files[0];
        var firstRole = StoreManifestMapping.ParseRole(first.Role);

        var existing = await _textureSetRepository.GetByFileHashAsync(first.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddTextureSetToPackAsync(packId, existing.Id, ct);
            return Skipped(item, OutcomeSkippedDedupe, "Texture set already present (deduplicated by SHA-256).");
        }

        if (firstRole.TextureTypeUnmapped)
            _logger.LogWarning("Store import: texture role '{Role}' not mapped; importing '{File}' as Albedo", first.Role, first.FileName);

        var firstBytes = await DownloadAndVerifyAsync(work, first, ct);
        var setId = await _sink.CreateTextureSetAsync(new InMemoryFileUpload(first.FileName, firstBytes), item.Name, firstRole.TextureType, ct);

        foreach (var file in files.Skip(1))
        {
            var role = StoreManifestMapping.ParseRole(file.Role);
            var bytes = await DownloadAndVerifyAsync(work, file, ct);
            var fileId = await _sink.UploadTextureFileAsync(setId, new InMemoryFileUpload(file.FileName, bytes), ct);
            await _sink.AddTextureAsync(setId, fileId, role.TextureType, role.SourceChannel, ct);
        }

        if (tags.Length > 0)
            await _sink.SetTextureSetTagsAsync(setId, tags, ct);

        await _sink.AddTextureSetToPackAsync(packId, setId, ct);
        return Created(item);
    }

    private async Task<StoreImportItemResult> ImportSoundAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, StoreManifestFile file, CancellationToken ct)
    {
        var existing = await _soundRepository.GetByFileHashAsync(file.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddSoundToPackAsync(packId, existing.Id, ct);
            return Skipped(item, OutcomeSkippedDedupe, "Sound already present (deduplicated by SHA-256).");
        }

        var bytes = await DownloadAndVerifyAsync(work, file, ct);
        var soundId = await _sink.CreateSoundAsync(new InMemoryFileUpload(file.FileName, bytes), item.Name, ct);
        await _sink.AddSoundToPackAsync(packId, soundId, ct);
        return Created(item);
    }

    private async Task<StoreImportItemResult> ImportSpriteAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, StoreManifestFile file, CancellationToken ct)
    {
        var existing = await _spriteRepository.GetByFileHashAsync(file.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddSpriteToPackAsync(packId, existing.Id, ct);
            return Skipped(item, OutcomeSkippedDedupe, "Sprite already present (deduplicated by SHA-256).");
        }

        var bytes = await DownloadAndVerifyAsync(work, file, ct);
        var spriteId = await _sink.CreateSpriteAsync(new InMemoryFileUpload(file.FileName, bytes), item.Name, ct);
        await _sink.AddSpriteToPackAsync(packId, spriteId, ct);
        return Created(item);
    }

    private async Task<StoreImportItemResult> ImportEnvironmentMapAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, StoreManifestFile file, CancellationToken ct)
    {
        var existing = await _environmentMapRepository.GetByFileHashAsync(file.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddEnvironmentMapToPackAsync(packId, existing.Id, ct);
            return Skipped(item, OutcomeSkippedDedupe, "Environment map already present (deduplicated by SHA-256).");
        }

        var bytes = await DownloadAndVerifyAsync(work, file, ct);
        var envMapId = await _sink.CreateEnvironmentMapAsync(new InMemoryFileUpload(file.FileName, bytes), item.Name, ct);
        await _sink.AddEnvironmentMapToPackAsync(packId, envMapId, ct);
        return Created(item);
    }

    private async Task<byte[]> DownloadAndVerifyAsync(StoreImportWorkItem work, StoreManifestFile file, CancellationToken ct)
    {
        var bytes = await _client.DownloadFileAsync(work.StoreUrl, file.DownloadUrl, work.ImportToken, file.FileSize, ct);

        var actual = await _fileUtilityService.CalculateFileHashAsync(new InMemoryFileUpload(file.FileName, bytes), ct);
        if (!string.Equals(actual, file.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            throw new StoreImportException(
                $"SHA-256 mismatch for '{file.FileName}': manifest '{file.Sha256}', downloaded '{actual}'.");
        }

        return bytes;
    }

    private async Task SaveJobAsync(StoreImportJob job, CancellationToken ct)
    {
        await _jobRepository.UpdateAsync(job, ct);
        await _unitOfWork.SaveChangesAsync(ct);
    }

    private Task NotifyAsync(
        StoreImportJob job, int processed, string? currentItem, string? message, CancellationToken ct,
        int created = 0, int skipped = 0, int failed = 0)
    {
        var progress = new StoreImportProgress(
            job.Id,
            job.Status.ToString(),
            job.PackId,
            job.ItemsTotal,
            processed,
            created,
            skipped,
            failed,
            currentItem,
            message);

        return _notifier.NotifyAsync(progress, ct);
    }

    private static StoreImportItemResult Created(StoreManifestItem item)
        => new(item.ItemType, item.Name, OutcomeCreated, null);

    private static StoreImportItemResult Skipped(StoreManifestItem item, string outcome, string reason)
        => new(item.ItemType, item.Name, outcome, reason);

    private static string BuildListingUrl(string storeUrl, string assetId)
        => $"{storeUrl.TrimEnd('/')}/asset/{assetId}";

    private static string Serialize(IReadOnlyList<StoreImportItemResult> results)
        => JsonSerializer.Serialize(results);
}
