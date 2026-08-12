using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
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

    // Previews carry no manifest size, so they get a fixed modest cap instead of the
    // multi-GB absolute file cap.
    private const long PreviewMaxBytes = 33_554_432; // 32 MiB

    /// <summary>
    /// Highest manifest schema this importer understands (see StoreManifest). A newer store may
    /// reshape or re-mean fields, so an unknown version is refused loudly rather than imported
    /// on v1 assumptions. Version 0 means "absent" and is treated as v1 for older manifests.
    /// </summary>
    private const int MaxSupportedManifestSchemaVersion = 1;

    private readonly IStoreImportClient _client;
    private readonly IStoreImportSink _sink;
    private readonly IStoreImportCategoryResolver _categoryResolver;
    private readonly IStoreImportJobRepository _jobRepository;
    private readonly IPackRepository _packRepository;
    private readonly IModelRepository _modelRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IChangeTrackerReset _trackerReset;
    private readonly IStoreImportProgressNotifier _notifier;
    private readonly ILogger<StoreImportProcessor> _logger;

    public StoreImportProcessor(
        IStoreImportClient client,
        IStoreImportSink sink,
        IStoreImportCategoryResolver categoryResolver,
        IStoreImportJobRepository jobRepository,
        IPackRepository packRepository,
        IModelRepository modelRepository,
        ITextureSetRepository textureSetRepository,
        ISoundRepository soundRepository,
        ISpriteRepository spriteRepository,
        IEnvironmentMapRepository environmentMapRepository,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork,
        IChangeTrackerReset trackerReset,
        IStoreImportProgressNotifier notifier,
        ILogger<StoreImportProcessor> logger)
    {
        _client = client;
        _sink = sink;
        _categoryResolver = categoryResolver;
        _jobRepository = jobRepository;
        _packRepository = packRepository;
        _modelRepository = modelRepository;
        _textureSetRepository = textureSetRepository;
        _soundRepository = soundRepository;
        _spriteRepository = spriteRepository;
        _environmentMapRepository = environmentMapRepository;
        _clock = clock;
        _unitOfWork = unitOfWork;
        _trackerReset = trackerReset;
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

            if (manifest.SchemaVersion > MaxSupportedManifestSchemaVersion)
                throw new StoreImportException(
                    $"Manifest schema version {manifest.SchemaVersion} is newer than this Modelibr supports " +
                    $"(up to v{MaxSupportedManifestSchemaVersion}). Update Modelibr to import from this store.");

            var items = manifest.Items ?? Array.Empty<StoreManifestItem>();

            // Partial import: when a selection is present, keep only those manifest items (by store
            // item id). An empty/absent selection imports the whole pack. Items lacking an id can't
            // be matched, so they're excluded while a selection is active.
            if (work.SelectedItemIds is { Count: > 0 })
            {
                var wanted = new HashSet<string>(work.SelectedItemIds, StringComparer.OrdinalIgnoreCase);
                items = items.Where(i => i.Id is not null && wanted.Contains(i.Id)).ToArray();
            }

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

            // One batch id for the whole import so every created asset groups into a single
            // upload-history batch (otherwise each Create* handler mints its own id per item).
            var batchId = $"store-import-{job.Id}";

            var results = new List<StoreImportItemResult>(items.Count);
            int created = 0, skipped = 0, failed = 0, processed = 0;

            foreach (var item in items)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await NotifyAsync(job, processed, item.Name, $"Importing {item.ItemType}", cancellationToken, created, skipped, failed);

                StoreImportItemResult outcome;
                try
                {
                    outcome = await ImportItemAsync(work, packId, item, tags, batchId, cancellationToken);
                }
                // Only a real host-shutdown cancellation aborts the run. HttpClient.Timeout also
                // surfaces as (Task)OperationCanceledException, and treating that as shutdown
                // used to abandon the whole job - a network timeout must fail just this item.
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (StoreImportException ex)
                {
                    // An exception thrown between a handler's staging and its SaveChanges
                    // leaves poisoned entities in the shared change tracker that would make
                    // every later save in this scope re-fail - reset before the next item.
                    _trackerReset.Clear();
                    outcome = new StoreImportItemResult(item.ItemType, item.Name, OutcomeFailed, ex.Message);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Store import: item '{Item}' ({ItemType}) failed", item.Name, item.ItemType);
                    _trackerReset.Clear();
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
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Host shutdown / cancellation: leave the job as-is here - the queue's startup
            // sweep marks interrupted jobs Failed on the next boot, and a new import
            // gap-fills via provenance + SHA dedupe. The `when` guard matters: an HTTP
            // timeout throws the same exception type, and swallowing it here left the job
            // Running forever with the UI polling it indefinitely. Those fall through to the
            // generic handler below and are persisted as Failed.
            _logger.LogInformation("Store import job {JobId} was cancelled", work.JobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Store import job {JobId} aborted", work.JobId);
            try
            {
                // The abort may have left poisoned entities behind; reset so the failure
                // state itself can still be persisted (UpdateIfDetached re-attaches the job).
                _trackerReset.Clear();
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

        try
        {
            // Creation stamps provenance in the same transaction (see IStoreImportSink), so the
            // pack is never visible without its idempotency key.
            return await CreatePackWithUniqueNameAsync(
                baseName, manifest.Description, license, listingUrl, work, manifest.SchemaVersion, ct);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            // A concurrent import of the SAME store asset passed the lookup above too and won the
            // race - the unique provenance index rejects this one. Adopt the winner's pack instead
            // of failing the job; anything else is a real error and rethrows.
            _trackerReset.Clear();
            var winner = await _packRepository.GetByStoreImportAsync(work.StoreUrl, work.AssetId, ct);
            if (winner is null)
                throw;

            _logger.LogInformation(
                "Store import: pack for {AssetId} was created concurrently; adopting pack {PackId}", work.AssetId, winner.Id);
            return winner.Id;
        }
    }

    // A pack name collision with an UNRELATED existing pack must not dead-end the import
    // (provenance already prevents re-import collisions). Disambiguate with a bounded suffix.
    private async Task<int> CreatePackWithUniqueNameAsync(
        string baseName, string? description, string? license, string url,
        StoreImportWorkItem work, int manifestVersion, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 25; attempt++)
        {
            var name = attempt == 0 ? baseName : $"{baseName} ({attempt + 1})";
            try
            {
                return await _sink.CreatePackAsync(
                    name, description, license, url, work.StoreUrl, work.AssetId, manifestVersion, ct);
            }
            catch (StoreImportException ex) when (ex.ErrorCode == "PackAlreadyExists")
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
            using var download = await _client.DownloadFileAsync(
                work.StoreUrl, preview.Url, work.ImportToken, expectedSizeBytes: 0, maxBytes: PreviewMaxBytes, ct);
            await _sink.SetPackThumbnailFromFileAsync(packId, download.ToUpload(preview.FileName, preview.ContentType), ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Best-effort: a missing/failed pack thumbnail must not fail the import.
            _trackerReset.Clear();
            _logger.LogWarning(ex, "Store import: failed to attach pack thumbnail for pack {PackId}", packId);
        }
    }

    // Content types UploadThumbnailCommand accepts - the store turntable is an animated WebP.
    private static readonly HashSet<string> ReusableThumbnailContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/jpg", "image/webp"
    };

    /// <summary>
    /// The store preview to reuse as this model's thumbnail, or null. Prefers the animated
    /// turntable, then a static thumbnail; requires a browser-renderable image content type
    /// (Modelibr shows model thumbnails as &lt;img&gt;, and UploadThumbnailCommand rejects others).
    /// </summary>
    private static StoreManifestPreview? PickReusableThumbnail(IReadOnlyList<StoreManifestPreview>? previews)
    {
        if (previews is null || previews.Count == 0)
            return null;

        static bool Usable(StoreManifestPreview p)
            => !string.IsNullOrWhiteSpace(p.Url)
               && p.ContentType is not null
               && ReusableThumbnailContentTypes.Contains(p.ContentType);

        return previews.FirstOrDefault(p => IsPreviewType(p, "Turntable") && Usable(p))
            ?? previews.FirstOrDefault(p => IsPreviewType(p, "Thumbnail") && Usable(p));
    }

    private static bool IsPreviewType(StoreManifestPreview preview, string type)
        => string.Equals(preview.Type, type, StringComparison.OrdinalIgnoreCase);

    private async Task<StoreDownloadedFile?> TryDownloadThumbnailAsync(
        StoreImportWorkItem work, StoreManifestPreview preview, string itemName, CancellationToken ct)
    {
        try
        {
            return await _client.DownloadFileAsync(
                work.StoreUrl, preview.Url, work.ImportToken, expectedSizeBytes: 0, maxBytes: PreviewMaxBytes, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Falling back to local generation is fine - log and move on.
            _logger.LogWarning(ex, "Store import: could not fetch the store thumbnail for '{Item}'; will generate one instead", itemName);
            return null;
        }
    }

    private async Task AttachStoreThumbnailBestEffortAsync(
        int modelId, StoreManifestPreview preview, StoreDownloadedFile download, CancellationToken ct)
    {
        try
        {
            await _sink.SetModelThumbnailFromFileAsync(modelId, download.ToUpload(preview.FileName, preview.ContentType), ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // The model exists (generation was suppressed) - a failed attach leaves it without a
            // thumbnail, recoverable via manual regenerate. Reset so a poisoned tracker doesn't
            // cascade into later items.
            _trackerReset.Clear();
            _logger.LogWarning(ex, "Store import: failed to attach the store thumbnail to model {ModelId}", modelId);
        }
    }

    private async Task<StoreImportItemResult> ImportItemAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, string[] tags, string? batchId, CancellationToken ct)
    {
        var target = StoreManifestMapping.PlanForItem(item.ItemType);
        if (target == StoreManifestMapping.ImportTarget.Unsupported)
        {
            // GAP (docs/VISION.md): PackItemType.Other has no Modelibr home - skip + report.
            return Skipped(item, OutcomeSkippedUnsupported, $"Unsupported item type '{item.ItemType}' - no Modelibr mapping.");
        }

        var files = item.Files ?? Array.Empty<StoreManifestFile>();
        if (files.Count == 0)
            throw new StoreImportException("Item has no files.");

        return target switch
        {
            StoreManifestMapping.ImportTarget.Model => await ImportModelAsync(work, packId, item, files, tags, batchId, ct),
            StoreManifestMapping.ImportTarget.TextureSet => await ImportTextureSetAsync(work, packId, item, files, tags, batchId, ct),
            StoreManifestMapping.ImportTarget.Sound => await ImportSoundAsync(work, packId, item, files, batchId, ct),
            StoreManifestMapping.ImportTarget.Sprite => await ImportSpriteAsync(work, packId, item, files, batchId, ct),
            StoreManifestMapping.ImportTarget.EnvironmentMap => await ImportEnvironmentMapAsync(work, packId, item, files, batchId, ct),
            _ => Skipped(item, OutcomeSkippedUnsupported, $"Unsupported item type '{item.ItemType}'.")
        };
    }

    private async Task<StoreImportItemResult> ImportModelAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, IReadOnlyList<StoreManifestFile> files, string[] tags, string? batchId, CancellationToken ct)
    {
        var primary = PickPrimary(files, StoreManifestMapping.RoleKind.Mesh);

        // SHA dedupe: if a model already exists for the primary file hash, link it - and
        // gap-fill any manifest files a previous partial run failed to attach, so re-running
        // the import repairs the item instead of freezing its gaps forever.
        var existing = await _modelRepository.GetByFileHashAsync(primary.Sha256, ct);
        if (existing != null)
        {
            var have = existing.Versions
                .SelectMany(v => v.Files)
                .Select(f => f.Sha256Hash)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var missing = files.Where(f => f.Sha256 is null || !have.Contains(f.Sha256)).ToList();

            foreach (var file in missing)
            {
                using var download = await DownloadAndVerifyAsync(work, file, ct);
                await _sink.AddFileToModelAsync(existing.Id, download.ToUpload(file.FileName), ct);
            }

            await _sink.AddModelToPackAsync(packId, existing.Id, ct);
            if (existing.ModelCategoryId is null
                && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Model, item, ct) is int gapFillCategoryId)
                await _sink.SetModelCategoryAsync(existing.Id, gapFillCategoryId, ct);
            var reason = missing.Count > 0
                ? $"Model already present (deduplicated by SHA-256); gap-filled {missing.Count} missing file(s)."
                : "Model already present (deduplicated by SHA-256).";
            return Skipped(item, OutcomeSkippedDedupe, reason);
        }

        // Reuse the store's already-rendered thumbnail (turntable preferred, else static)
        // instead of re-rendering it locally. Download it FIRST: a failed fetch simply falls
        // back to normal generation, so the model never ends up with no thumbnail at all.
        var reusablePreview = PickReusableThumbnail(item.Previews);
        var thumbnailDownload = reusablePreview is null
            ? null
            : await TryDownloadThumbnailAsync(work, reusablePreview, item.Name, ct);

        try
        {
            var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Model, item, ct);

            using var primaryDownload = await DownloadAndVerifyAsync(work, primary, ct);
            var modelId = await _sink.CreateModelAsync(
                primaryDownload.ToUpload(primary.FileName), item.Name, batchId,
                generateThumbnail: thumbnailDownload is null, ct);

            foreach (var file in files)
            {
                if (ReferenceEquals(file, primary))
                    continue;
                using var download = await DownloadAndVerifyAsync(work, file, ct);
                await _sink.AddFileToModelAsync(modelId, download.ToUpload(file.FileName), ct);
            }

            // Tags (+ item name reused as description) mirror the CLI: applied only when the
            // manifest carries tags. Models/texture sets are the only per-type tag vocabularies.
            // The item category rides the same command (it's UpdateModelTags that assigns
            // model categories throughout the app).
            if (tags.Length > 0 || categoryId.HasValue)
                await _sink.SetModelTagsAsync(modelId, tags, item.Name, categoryId, ct);

            await _sink.AddModelToPackAsync(packId, modelId, ct);

            if (thumbnailDownload is not null && reusablePreview is not null)
                await AttachStoreThumbnailBestEffortAsync(modelId, reusablePreview, thumbnailDownload, ct);
        }
        finally
        {
            thumbnailDownload?.Dispose();
        }

        return Created(item);
    }

    private async Task<StoreImportItemResult> ImportTextureSetAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, IReadOnlyList<StoreManifestFile> files, string[] tags, string? batchId, CancellationToken ct)
    {
        var first = files[0];
        var firstRole = StoreManifestMapping.ParseRole(first.Role);

        var existing = await _textureSetRepository.GetByFileHashAsync(first.Sha256, ct);
        if (existing != null)
        {
            // Same gap-fill contract as models: attach manifest textures missing from the set.
            var have = existing.Textures
                .Where(t => t.File is not null)
                .Select(t => t.File!.Sha256Hash)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var missing = files.Where(f => f.Sha256 is null || !have.Contains(f.Sha256)).ToList();

            foreach (var file in missing)
            {
                var role = StoreManifestMapping.ParseRole(file.Role);
                using var download = await DownloadAndVerifyAsync(work, file, ct);
                var fileId = await _sink.UploadTextureFileAsync(existing.Id, download.ToUpload(file.FileName), ct);
                await _sink.AddTextureAsync(existing.Id, fileId, role.TextureType, role.SourceChannel, ct);
            }

            await _sink.AddTextureSetToPackAsync(packId, existing.Id, ct);
            if (existing.TextureSetCategoryId is null
                && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.TextureSet, item, ct) is int gapFillCategoryId)
                await _sink.SetTextureSetCategoryAsync(existing.Id, existing.Name, gapFillCategoryId, ct);
            var reason = missing.Count > 0
                ? $"Texture set already present (deduplicated by SHA-256); gap-filled {missing.Count} missing texture(s)."
                : "Texture set already present (deduplicated by SHA-256).";
            return Skipped(item, OutcomeSkippedDedupe, reason);
        }

        if (firstRole.TextureTypeUnmapped)
            _logger.LogWarning("Store import: texture role '{Role}' not mapped; importing '{File}' as Albedo", first.Role, first.FileName);

        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.TextureSet, item, ct);

        int setId;
        using (var firstDownload = await DownloadAndVerifyAsync(work, first, ct))
        {
            setId = await _sink.CreateTextureSetAsync(firstDownload.ToUpload(first.FileName), item.Name, firstRole.TextureType, batchId, categoryId, ct);
        }

        foreach (var file in files.Skip(1))
        {
            var role = StoreManifestMapping.ParseRole(file.Role);
            using var download = await DownloadAndVerifyAsync(work, file, ct);
            var fileId = await _sink.UploadTextureFileAsync(setId, download.ToUpload(file.FileName), ct);
            await _sink.AddTextureAsync(setId, fileId, role.TextureType, role.SourceChannel, ct);
        }

        if (tags.Length > 0)
            await _sink.SetTextureSetTagsAsync(setId, tags, ct);

        await _sink.AddTextureSetToPackAsync(packId, setId, ct);
        return Created(item);
    }

    private async Task<StoreImportItemResult> ImportSoundAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, IReadOnlyList<StoreManifestFile> files, string? batchId, CancellationToken ct)
    {
        var primary = PickPrimary(files, StoreManifestMapping.RoleKind.Audio);
        var extraNote = ExtraFilesNote(files, "sounds");

        var existing = await _soundRepository.GetByFileHashAsync(primary.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddSoundToPackAsync(packId, existing.Id, ct);
            if (existing.SoundCategoryId is null
                && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sound, item, ct) is int gapFillCategoryId)
                await _sink.SetSoundCategoryAsync(existing.Id, gapFillCategoryId, ct);
            return Skipped(item, OutcomeSkippedDedupe, Append("Sound already present (deduplicated by SHA-256).", extraNote));
        }

        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sound, item, ct);

        using var download = await DownloadAndVerifyAsync(work, primary, ct);
        var soundId = await _sink.CreateSoundAsync(download.ToUpload(primary.FileName), item.Name, batchId, categoryId, ct);
        await _sink.AddSoundToPackAsync(packId, soundId, ct);
        return Created(item, extraNote);
    }

    private async Task<StoreImportItemResult> ImportSpriteAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, IReadOnlyList<StoreManifestFile> files, string? batchId, CancellationToken ct)
    {
        var primary = PickPrimary(files, StoreManifestMapping.RoleKind.Image);
        var extraNote = ExtraFilesNote(files, "sprites");

        var existing = await _spriteRepository.GetByFileHashAsync(primary.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddSpriteToPackAsync(packId, existing.Id, ct);
            if (existing.SpriteCategoryId is null
                && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sprite, item, ct) is int gapFillCategoryId)
                await _sink.SetSpriteCategoryAsync(existing.Id, gapFillCategoryId, ct);
            return Skipped(item, OutcomeSkippedDedupe, Append("Sprite already present (deduplicated by SHA-256).", extraNote));
        }

        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sprite, item, ct);

        using var download = await DownloadAndVerifyAsync(work, primary, ct);
        var spriteId = await _sink.CreateSpriteAsync(download.ToUpload(primary.FileName), item.Name, batchId, categoryId, ct);
        await _sink.AddSpriteToPackAsync(packId, spriteId, ct);
        return Created(item, extraNote);
    }

    private async Task<StoreImportItemResult> ImportEnvironmentMapAsync(
        StoreImportWorkItem work, int packId, StoreManifestItem item, IReadOnlyList<StoreManifestFile> files, string? batchId, CancellationToken ct)
    {
        var primary = PickPrimary(files, StoreManifestMapping.RoleKind.Panorama);
        var extraNote = ExtraFilesNote(files, "environment maps");

        var existing = await _environmentMapRepository.GetByFileHashAsync(primary.Sha256, ct);
        if (existing != null)
        {
            await _sink.AddEnvironmentMapToPackAsync(packId, existing.Id, ct);
            if (existing.EnvironmentMapCategoryId is null
                && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.EnvironmentMap, item, ct) is int gapFillCategoryId)
                await _sink.SetEnvironmentMapCategoryAsync(existing.Id, gapFillCategoryId, ct);
            return Skipped(item, OutcomeSkippedDedupe, Append("Environment map already present (deduplicated by SHA-256).", extraNote));
        }

        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.EnvironmentMap, item, ct);

        using var download = await DownloadAndVerifyAsync(work, primary, ct);
        var envMapId = await _sink.CreateEnvironmentMapAsync(download.ToUpload(primary.FileName), item.Name, batchId, ct);
        if (categoryId.HasValue)
            await _sink.SetEnvironmentMapCategoryAsync(envMapId, categoryId.Value, ct);
        await _sink.AddEnvironmentMapToPackAsync(packId, envMapId, ct);
        return Created(item, extraNote);
    }

    // Category policy: newly created assets receive the manifest category; dedupe hits are
    // gap-filled ONLY when currently uncategorized - a category the user (or an earlier
    // import) already assigned is never overwritten, so re-running an import categorizes
    // assets that predate category support without clobbering manual organization.
    // Resolution is best-effort (see IStoreImportCategoryResolver) and never fails an item.
    private Task<int?> ResolveCategoryAsync(StoreManifestMapping.ImportTarget target, StoreManifestItem item, CancellationToken ct)
        => _categoryResolver.ResolveAsync(target, StoreManifestMapping.GetItemCategory(item.MetadataJson), ct);

    private async Task<StoreDownloadedFile> DownloadAndVerifyAsync(StoreImportWorkItem work, StoreManifestFile file, CancellationToken ct)
    {
        var download = await _client.DownloadFileAsync(work.StoreUrl, file.DownloadUrl, work.ImportToken, file.FileSize, maxBytes: null, ct);

        if (!string.Equals(download.Sha256, file.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            var actual = download.Sha256;
            download.Dispose();
            throw new StoreImportException(
                $"SHA-256 mismatch for '{file.FileName}': manifest '{file.Sha256}', downloaded '{actual}'.");
        }

        return download;
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

    /// <summary>The file whose role matches the item's expected primary kind, or the first file.</summary>
    private static StoreManifestFile PickPrimary(IReadOnlyList<StoreManifestFile> files, StoreManifestMapping.RoleKind preferred)
        => files.FirstOrDefault(f => StoreManifestMapping.ParseRole(f.Role).Kind == preferred) ?? files[0];

    /// <summary>
    /// Sounds/sprites/environment maps are single-file assets in Modelibr; when the manifest
    /// item carries more files, the surplus is surfaced in the outcome reason instead of
    /// being dropped silently.
    /// </summary>
    private static string? ExtraFilesNote(IReadOnlyList<StoreManifestFile> files, string assetTypeName)
        => files.Count > 1
            ? $"{files.Count - 1} additional file(s) not imported - {assetTypeName} are single-file assets in Modelibr."
            : null;

    private static string? Append(string reason, string? note)
        => note is null ? reason : $"{reason} {note}";

    private static StoreImportItemResult Created(StoreManifestItem item, string? reason = null)
        => new(item.ItemType, item.Name, OutcomeCreated, reason);

    private static StoreImportItemResult Skipped(StoreManifestItem item, string outcome, string reason)
        => new(item.ItemType, item.Name, outcome, reason);

    // Must match the storefront's asset detail route (`/assets/:id` in the store frontend's
    // App.tsx) - this URL is shown as the pack's source link and has to actually open.
    private static string BuildListingUrl(string storeUrl, string assetId)
        => $"{storeUrl.TrimEnd('/')}/assets/{assetId}";

    private static string Serialize(IReadOnlyList<StoreImportItemResult> results)
        => JsonSerializer.Serialize(results);
}
