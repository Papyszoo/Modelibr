using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.StoreImports;

/// <summary>
/// Per-item outcome recorded in the job's result log and used for the counters.
/// </summary>
/// <param name="AssetType">
/// The Modelibr family the item landed in, and <paramref name="AssetId"/> the asset it
/// created or matched. Both null when the item was skipped as unsupported or failed.
/// Reported so a caller that imports can then act on what it imported without searching for
/// it by name - and so the metadata stamp below has something to write against.
/// </param>
public sealed record StoreImportItemResult(
    string ItemType,
    string Name,
    string Outcome,
    string? Reason,
    string? AssetType = null,
    int? AssetId = null);

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
    private readonly IStoreImportedItemRepository _storeImportedItemRepository;
    private readonly IStoreImportLockService _lockService;
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
        IStoreImportedItemRepository storeImportedItemRepository,
        IStoreImportLockService lockService,
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
        _storeImportedItemRepository = storeImportedItemRepository;
        _lockService = lockService;
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

                var itemTags = (StoreManifestMapping.ResolveItemTags(item, manifest) ?? Array.Empty<string>())
                    .Where(t => !string.IsNullOrWhiteSpace(t))
                    .ToArray();

                StoreImportItemResult outcome;
                try
                {
                    outcome = await ImportItemAsync(work, manifest, packId, item, itemTags, batchId, cancellationToken);
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

                // Rights and provenance ride the same loop as the files (prompt 16-E). Done
                // here rather than inside each family's import so there is one policy, not
                // five - and it runs for dedupe hits too, which is what backfills an asset a
                // previous import created before the schema existed.
                if (outcome.AssetType is not null && outcome.AssetId is int stampAssetId)
                {
                    await StampAssetMetadataBestEffortAsync(
                        work, manifest, item, outcome.AssetType, stampAssetId, cancellationToken);
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

    /// <summary>
    /// Writes what the manifest says about an asset's rights and where it came from onto the
    /// asset itself (prompt 16-E). Best-effort by design: the files are already imported and
    /// usable, so a metadata failure downgrades the asset's description rather than the item.
    /// </summary>
    private async Task StampAssetMetadataBestEffortAsync(
        StoreImportWorkItem work,
        StoreManifest manifest,
        StoreManifestItem item,
        string assetType,
        int assetId,
        CancellationToken ct)
    {
        try
        {
            var license = StoreManifestMapping.MapSchemaLicense(manifest.License);
            var canonicalStoreUrl = StoreUrlCanonicalizer.Canonicalize(work.StoreUrl);

            var facetsDict = new Dictionary<string, object>(StringComparer.Ordinal);
            if (item.Styles is { Count: > 0 }) facetsDict["styles"] = item.Styles;
            if (item.Themes is { Count: > 0 }) facetsDict["themes"] = item.Themes;

            var existingFacets = StoreManifestMapping.GetItemFacets(item.MetadataJson);
            if (!string.IsNullOrWhiteSpace(existingFacets))
            {
                using var doc = JsonDocument.Parse(existingFacets);
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    if (!facetsDict.ContainsKey(prop.Name))
                    {
                        facetsDict[prop.Name] = prop.Value.Clone();
                    }
                }
            }

            var facetsJson = facetsDict.Count > 0 ? JsonSerializer.Serialize(facetsDict) : null;

            await _sink.StampAssetMetadataAsync(
                assetType,
                assetId,
                new StoreAssetMetadataStamp(
                    License: license,
                    // The raw string, even when it mapped cleanly - "CC BY 4.0" is what the
                    // author wrote, and the mapped value has already thrown the version away.
                    LicenseName: string.IsNullOrWhiteSpace(manifest.License) ? null : manifest.License.Trim(),
                    Author: manifest.Author,
                    CreditName: manifest.CreditName,
                    CreditUrl: manifest.CreditUrl,
                    AttributionRequired: StoreManifestMapping.RequiresAttribution(license),
                    SourceUrl: BuildListingUrl(work.StoreUrl, work.AssetId),
                    StoreUrl: canonicalStoreUrl,
                    StoreAssetId: work.AssetId,
                    StoreItemId: item.Id,
                    ImportedAt: _clock.UtcNow,
                    FacetsJson: facetsJson),
                ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _trackerReset.Clear();
            _logger.LogWarning(
                ex, "Store import: failed to stamp metadata on {AssetType} {AssetId}", assetType, assetId);
        }
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

    private readonly record struct AssetTargetStatus(bool Exists, bool IsSoftDeleted, object? Asset);

    private async Task<AssetTargetStatus> GetAssetStatusAsync(string assetType, int assetId, CancellationToken ct)
    {
        switch (assetType.ToLowerInvariant())
        {
            case "model":
                var model = await _modelRepository.GetByIdAsync(assetId, ct);
                if (model != null) return new AssetTargetStatus(true, false, model);
                var delModel = await _modelRepository.GetDeletedByIdAsync(assetId, ct);
                if (delModel != null) return new AssetTargetStatus(true, true, delModel);
                return new AssetTargetStatus(false, false, null);

            case "textureset":
                var ts = await _textureSetRepository.GetByIdAsync(assetId, ct);
                if (ts != null) return new AssetTargetStatus(true, false, ts);
                var delTs = await _textureSetRepository.GetDeletedByIdAsync(assetId, ct);
                if (delTs != null) return new AssetTargetStatus(true, true, delTs);
                return new AssetTargetStatus(false, false, null);

            case "sound":
                var sound = await _soundRepository.GetByIdAsync(assetId, ct);
                if (sound != null) return new AssetTargetStatus(true, false, sound);
                var delSound = await _soundRepository.GetDeletedByIdAsync(assetId, ct);
                if (delSound != null) return new AssetTargetStatus(true, true, delSound);
                return new AssetTargetStatus(false, false, null);

            case "sprite":
                var sprite = await _spriteRepository.GetByIdAsync(assetId, ct);
                if (sprite != null) return new AssetTargetStatus(true, false, sprite);
                var delSprite = await _spriteRepository.GetDeletedByIdAsync(assetId, ct);
                if (delSprite != null) return new AssetTargetStatus(true, true, delSprite);
                return new AssetTargetStatus(false, false, null);

            case "environmentmap":
                var env = await _environmentMapRepository.GetByIdAsync(assetId, ct);
                if (env != null) return new AssetTargetStatus(true, false, env);
                var delEnv = await _environmentMapRepository.GetDeletedByIdAsync(assetId, ct);
                if (delEnv != null) return new AssetTargetStatus(true, true, delEnv);
                return new AssetTargetStatus(false, false, null);

            default:
                return new AssetTargetStatus(false, false, null);
        }
    }

    private static string GetCanonicalFamilyName(StoreManifestMapping.ImportTarget target) => target switch
    {
        StoreManifestMapping.ImportTarget.Model => StoreManifestMapping.ItemTypeModel,
        StoreManifestMapping.ImportTarget.TextureSet => StoreManifestMapping.ItemTypeTextureSet,
        StoreManifestMapping.ImportTarget.Sound => StoreManifestMapping.ItemTypeSound,
        StoreManifestMapping.ImportTarget.Sprite => StoreManifestMapping.ItemTypeSprite,
        StoreManifestMapping.ImportTarget.EnvironmentMap => StoreManifestMapping.ItemTypeEnvironmentMap,
        _ => string.Empty
    };

    private async Task<StoreImportItemResult> ImportItemAsync(
        StoreImportWorkItem work, StoreManifest manifest, int packId, StoreManifestItem item, string[] tags, string? batchId, CancellationToken ct)
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

        var canonicalStoreUrl = StoreUrlCanonicalizer.Canonicalize(work.StoreUrl);
        var canonicalFamily = GetCanonicalFamilyName(target);

        // =======================================================================
        // PHASE 1: Optimistic check and staged downloads OUTSIDE database transaction
        // =======================================================================
        StoreImportedItem? optimisticProv = null;
        if (!string.IsNullOrWhiteSpace(item.Id))
        {
            optimisticProv = await _storeImportedItemRepository.GetByProvenanceAsync(canonicalStoreUrl, work.AssetId, item.Id, ct);
            if (optimisticProv != null)
            {
                var targetStatus = await GetAssetStatusAsync(optimisticProv.AssetType, optimisticProv.AssetId, ct);
                if (targetStatus.Exists && targetStatus.IsSoftDeleted)
                {
                    // Target is in recycle bin - return immediately with 0 downloads!
                    return Skipped(item, OutcomeSkippedDedupe, "Asset is in the recycle bin. Restore it to use it.", optimisticProv.AssetType, optimisticProv.AssetId);
                }
            }
        }

        var primary = target switch
        {
            StoreManifestMapping.ImportTarget.Model => PickPrimary(files, StoreManifestMapping.RoleKind.Mesh),
            StoreManifestMapping.ImportTarget.Sound => PickPrimary(files, StoreManifestMapping.RoleKind.Audio),
            StoreManifestMapping.ImportTarget.Sprite => PickPrimary(files, StoreManifestMapping.RoleKind.Image),
            StoreManifestMapping.ImportTarget.EnvironmentMap => PickPrimary(files, StoreManifestMapping.RoleKind.Panorama),
            _ => files[0]
        };

        // Determine files to download for staging
        var stagedDownloads = new Dictionary<StoreManifestFile, StoreDownloadedFile>();
        StoreDownloadedFile? thumbnailDownload = null;
        var reusablePreview = target == StoreManifestMapping.ImportTarget.Model ? PickReusableThumbnail(item.Previews) : null;

        try
        {
            if (optimisticProv != null)
            {
                var targetStatus = await GetAssetStatusAsync(optimisticProv.AssetType, optimisticProv.AssetId, ct);
                if (targetStatus.Exists && !targetStatus.IsSoftDeleted)
                {
                    // Gap-fill check: download only missing files
                    var missingFiles = GetMissingFiles(target, targetStatus.Asset, files);
                    foreach (var missingFile in missingFiles)
                    {
                        var dl = await DownloadAndVerifyAsync(work, missingFile, ct);
                        stagedDownloads[missingFile] = dl;
                    }
                }
                else
                {
                    // Stale provenance: target asset was permanently deleted / corrupted.
                    // Staging download for full creation.
                    foreach (var file in files)
                    {
                        var dl = await DownloadAndVerifyAsync(work, file, ct);
                        stagedDownloads[file] = dl;
                    }
                    if (reusablePreview != null)
                    {
                        thumbnailDownload = await TryDownloadThumbnailAsync(work, reusablePreview, item.Name, ct);
                    }
                }
            }
            else
            {
                // A store item is the identity of a multi-file asset. Its primary hash may
                // legitimately match another store item, so only single-file families and
                // legacy manifests without an item id use SHA as their identity fallback.
                var shouldCheckSha = string.IsNullOrWhiteSpace(item.Id) || IsSingleFileFamily(target);
                var shaHit = shouldCheckSha
                    ? await CheckOptimisticShaHitAsync(target, primary.Sha256, ct)
                    : new ShaHitResult(false, false, 0, null);

                if (shaHit.Exists && shaHit.IsSoftDeleted)
                {
                    return Skipped(item, OutcomeSkippedDedupe, "Asset is in the recycle bin. Restore it to use it.", canonicalFamily, shaHit.AssetId);
                }

                if (shaHit.Exists)
                {
                    foreach (var missingFile in GetMissingFiles(target, shaHit.Asset, files))
                    {
                        var dl = await DownloadAndVerifyAsync(work, missingFile, ct);
                        stagedDownloads[missingFile] = dl;
                    }
                }
                else
                {
                    // Download full item for creation
                    foreach (var file in files)
                    {
                        var dl = await DownloadAndVerifyAsync(work, file, ct);
                        stagedDownloads[file] = dl;
                    }
                    if (reusablePreview != null)
                    {
                        thumbnailDownload = await TryDownloadThumbnailAsync(work, reusablePreview, item.Name, ct);
                    }
                }
            }

            // =======================================================================
            // PHASE 2: Atomic Transaction & Advisory Lock Serialization
            // =======================================================================
            var txResult = await _unitOfWork.InTransactionAsync<StoreImportItemResult>(async txCt =>
            {
                // 1. Provenance Lock & Re-check
                if (!string.IsNullOrWhiteSpace(item.Id))
                {
                    var provLockKey = $"store-item:{canonicalStoreUrl}:{work.AssetId}:{item.Id}";
                    await _lockService.AcquireLockAsync(provLockKey, txCt);

                    var prov = await _storeImportedItemRepository.GetByProvenanceAsync(canonicalStoreUrl, work.AssetId, item.Id, txCt);
                    if (prov != null)
                    {
                        if (!string.Equals(prov.AssetType, item.ItemType, StringComparison.OrdinalIgnoreCase))
                        {
                            return Result.Failure<StoreImportItemResult>(new Error(
                                "StoreImport.IntegrityError",
                                $"Store item provenance integrity error: item '{item.Name}' ({item.Id}) is recorded as local {prov.AssetType} {prov.AssetId}, but manifest defines it as {item.ItemType}."));
                        }

                        var status = await GetAssetStatusAsync(prov.AssetType, prov.AssetId, txCt);
                        if (status.Exists)
                        {
                            if (status.IsSoftDeleted)
                            {
                                return Result.Success(Skipped(item, OutcomeSkippedDedupe, "Asset is in the recycle bin. Restore it to use it.", prov.AssetType, prov.AssetId));
                            }

                            // Active asset dedupe hit! Link to pack, gap-fill category, and attach missing staged files
                            var outcomeReason = await HandleExistingAssetDedupeAsync(packId, item, files, prov.AssetType, prov.AssetId, status.Asset!, stagedDownloads, manifest, tags, txCt);
                            return Result.Success(Skipped(item, OutcomeSkippedDedupe, outcomeReason, prov.AssetType, prov.AssetId));
                        }

                        // Target asset was permanently deleted -> delete stale provenance row and recreate
                        _logger.LogWarning("Store import: provenance row pointed to missing {AssetType} {AssetId}; recreating asset", prov.AssetType, prov.AssetId);
                        await _storeImportedItemRepository.DeleteAsync(prov, txCt);
                    }
                }

                // 2. SHA Lock & Re-check for legacy manifests (no item.Id) or single-file families
                if (string.IsNullOrWhiteSpace(item.Id) || IsSingleFileFamily(target))
                {
                    if (!string.IsNullOrWhiteSpace(primary.Sha256))
                    {
                        var shaLockKey = $"sha:{canonicalFamily}:{primary.Sha256}";
                        await _lockService.AcquireLockAsync(shaLockKey, txCt);

                        var existingAsset = await FindAssetByShaAsync(target, primary.Sha256, txCt);
                        if (existingAsset != null)
                        {
                            var outcomeReason = await HandleExistingAssetDedupeAsync(packId, item, files, canonicalFamily, existingAsset.Id, existingAsset.Entity, stagedDownloads, manifest, tags, txCt);

                            if (!string.IsNullOrWhiteSpace(item.Id))
                            {
                                var provenance = StoreImportedItem.Create(canonicalStoreUrl, work.AssetId, item.Id, canonicalFamily, existingAsset.Id, _clock.UtcNow);
                                await _storeImportedItemRepository.AddAsync(provenance, txCt);
                            }

                            return Result.Success(Skipped(item, OutcomeSkippedDedupe, outcomeReason, canonicalFamily, existingAsset.Id));
                        }

                        var deletedAsset = await FindDeletedAssetByShaAsync(target, primary.Sha256, txCt);
                        if (deletedAsset != null)
                        {
                            return Result.Success(Skipped(
                                item,
                                OutcomeSkippedDedupe,
                                "Asset is in the recycle bin. Restore it to use it.",
                                canonicalFamily,
                                deletedAsset.Id));
                        }
                    }
                }

                // 3. Asset Creation from Staged Downloads
                int createdAssetId = target switch
                {
                    StoreManifestMapping.ImportTarget.Model => await CreateModelFromStagedAsync(packId, item, files, primary, tags, batchId, stagedDownloads, thumbnailDownload, reusablePreview, manifest, txCt),
                    StoreManifestMapping.ImportTarget.TextureSet => await CreateTextureSetFromStagedAsync(packId, item, files, tags, batchId, stagedDownloads, txCt),
                    StoreManifestMapping.ImportTarget.Sound => await CreateSoundFromStagedAsync(packId, item, primary, tags, batchId, stagedDownloads, txCt),
                    StoreManifestMapping.ImportTarget.Sprite => await CreateSpriteFromStagedAsync(packId, item, primary, tags, batchId, stagedDownloads, txCt),
                    StoreManifestMapping.ImportTarget.EnvironmentMap => await CreateEnvironmentMapFromStagedAsync(packId, item, primary, batchId, stagedDownloads, txCt),
                    _ => throw new StoreImportException($"Unsupported target {target}")
                };

                if (!string.IsNullOrWhiteSpace(item.Id))
                {
                    var provenance = StoreImportedItem.Create(canonicalStoreUrl, work.AssetId, item.Id, canonicalFamily, createdAssetId, _clock.UtcNow);
                    await _storeImportedItemRepository.AddAsync(provenance, txCt);
                }

                var extraNote = ExtraFilesNote(files, target switch
                {
                    StoreManifestMapping.ImportTarget.Sound => "sounds",
                    StoreManifestMapping.ImportTarget.Sprite => "sprites",
                    StoreManifestMapping.ImportTarget.EnvironmentMap => "environment maps",
                    _ => string.Empty
                });

                return Result.Success(Created(item, canonicalFamily, createdAssetId, extraNote));
            }, ct);

            if (txResult.IsFailure)
            {
                throw new StoreImportException(txResult.Error.Message);
            }

            return txResult.Value;
        }
        finally
        {
            foreach (var dl in stagedDownloads.Values)
            {
                dl.Dispose();
            }
            thumbnailDownload?.Dispose();
        }
    }

    private static bool IsSingleFileFamily(StoreManifestMapping.ImportTarget target)
        => target is StoreManifestMapping.ImportTarget.Sound
            or StoreManifestMapping.ImportTarget.Sprite
            or StoreManifestMapping.ImportTarget.EnvironmentMap;

    private static List<StoreManifestFile> GetMissingFiles(
        StoreManifestMapping.ImportTarget target, object? asset, IReadOnlyList<StoreManifestFile> files)
    {
        if (asset is null) return files.ToList();

        if (target == StoreManifestMapping.ImportTarget.Model && asset is Model model)
        {
            var have = model.Versions
                .SelectMany(v => v.Files)
                .Select(f => f.Sha256Hash)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            return files.Where(f => f.Sha256 is null || !have.Contains(f.Sha256)).ToList();
        }

        if (target == StoreManifestMapping.ImportTarget.TextureSet && asset is TextureSet textureSet)
        {
            var have = textureSet.Textures
                .Where(t => t.File is not null)
                .Select(t => t.File!.Sha256Hash)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            return files.Where(f => f.Sha256 is null || !have.Contains(f.Sha256)).ToList();
        }

        return new List<StoreManifestFile>();
    }

    private readonly record struct ShaHitResult(bool Exists, bool IsSoftDeleted, int AssetId, object? Asset);

    private async Task<ShaHitResult> CheckOptimisticShaHitAsync(
        StoreManifestMapping.ImportTarget target, string? sha256, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sha256))
            return new ShaHitResult(false, false, 0, null);

        var asset = await FindAssetByShaAsync(target, sha256, ct);
        if (asset != null)
            return new ShaHitResult(true, false, asset.Id, asset.Entity);

        var deletedAsset = await FindDeletedAssetByShaAsync(target, sha256, ct);
        return deletedAsset == null
            ? new ShaHitResult(false, false, 0, null)
            : new ShaHitResult(true, true, deletedAsset.Id, deletedAsset.Entity);
    }

    private async Task<AssetLookupResult?> FindAssetByShaAsync(
        StoreManifestMapping.ImportTarget target, string sha256, CancellationToken ct)
    {
        switch (target)
        {
            case StoreManifestMapping.ImportTarget.Model:
                var m = await _modelRepository.GetByFileHashAsync(sha256, ct);
                return m == null ? null : new AssetLookupResult(m.Id, m);

            case StoreManifestMapping.ImportTarget.TextureSet:
                var ts = await _textureSetRepository.GetByFileHashAsync(sha256, ct);
                return ts == null ? null : new AssetLookupResult(ts.Id, ts);

            case StoreManifestMapping.ImportTarget.Sound:
                var s = await _soundRepository.GetByFileHashAsync(sha256, ct);
                return s == null ? null : new AssetLookupResult(s.Id, s);

            case StoreManifestMapping.ImportTarget.Sprite:
                var sp = await _spriteRepository.GetByFileHashAsync(sha256, ct);
                return sp == null ? null : new AssetLookupResult(sp.Id, sp);

            case StoreManifestMapping.ImportTarget.EnvironmentMap:
                var em = await _environmentMapRepository.GetByFileHashAsync(sha256, ct);
                return em == null ? null : new AssetLookupResult(em.Id, em);

            default:
                return null;
        }
    }

    private sealed record AssetLookupResult(int Id, object Entity);

    private async Task<AssetLookupResult?> FindDeletedAssetByShaAsync(
        StoreManifestMapping.ImportTarget target, string sha256, CancellationToken ct)
    {
        switch (target)
        {
            case StoreManifestMapping.ImportTarget.Model:
                var m = await _modelRepository.GetDeletedByFileHashAsync(sha256, ct);
                return m == null ? null : new AssetLookupResult(m.Id, m);

            case StoreManifestMapping.ImportTarget.TextureSet:
                var ts = await _textureSetRepository.GetDeletedByFileHashAsync(sha256, ct);
                return ts == null ? null : new AssetLookupResult(ts.Id, ts);

            case StoreManifestMapping.ImportTarget.Sound:
                var s = await _soundRepository.GetDeletedByFileHashAsync(sha256, ct);
                return s == null ? null : new AssetLookupResult(s.Id, s);

            case StoreManifestMapping.ImportTarget.Sprite:
                var sp = await _spriteRepository.GetDeletedByFileHashAsync(sha256, ct);
                return sp == null ? null : new AssetLookupResult(sp.Id, sp);

            case StoreManifestMapping.ImportTarget.EnvironmentMap:
                var em = await _environmentMapRepository.GetDeletedByFileHashAsync(sha256, ct);
                return em == null ? null : new AssetLookupResult(em.Id, em);

            default:
                return null;
        }
    }

    private async Task<string> HandleExistingAssetDedupeAsync(
        int packId,
        StoreManifestItem item,
        IReadOnlyList<StoreManifestFile> files,
        string assetType,
        int assetId,
        object asset,
        Dictionary<StoreManifestFile, StoreDownloadedFile> stagedDownloads,
        StoreManifest manifest,
        string[] tags,
        CancellationToken ct)
    {
        var target = StoreManifestMapping.PlanForItem(item.ItemType);
        var extraNote = ExtraFilesNote(files, target switch
        {
            StoreManifestMapping.ImportTarget.Sound => "sounds",
            StoreManifestMapping.ImportTarget.Sprite => "sprites",
            StoreManifestMapping.ImportTarget.EnvironmentMap => "environment maps",
            _ => string.Empty
        });

        switch (target)
        {
            case StoreManifestMapping.ImportTarget.Model when asset is Model model:
            {
                var have = model.Versions
                    .SelectMany(v => v.Files)
                    .Select(f => f.Sha256Hash)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                var missing = files.Where(f => f.Sha256 is null || !have.Contains(f.Sha256)).ToList();

                foreach (var file in missing)
                {
                    var download = RequireStagedDownload(stagedDownloads, file);
                    await _sink.AddFileToModelAsync(model.Id, download.ToUpload(file.FileName), ct);
                }

                await _sink.AddModelToPackAsync(packId, model.Id, ct);
                if (model.ModelCategoryId is null && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Model, item, ct) is int gapFillCat)
                {
                    await _sink.SetModelCategoryAsync(model.Id, gapFillCat, ct);
                }

                var newDescription = string.IsNullOrWhiteSpace(model.Description)
                    ? StoreManifestMapping.ResolveItemDescription(item, manifest)
                    : model.Description;
                var currentTagNames = model.Tags.Select(t => t.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
                var hasNewTags = tags.Any(t => !currentTagNames.Contains(t));
                var hasNewDesc = string.IsNullOrWhiteSpace(model.Description) && !string.IsNullOrWhiteSpace(newDescription);

                if (hasNewTags || hasNewDesc)
                {
                    var combinedTags = model.Tags.Select(t => t.Name).Union(tags, StringComparer.OrdinalIgnoreCase).ToArray();
                    await _sink.SetModelTagsAsync(model.Id, combinedTags, newDescription, model.ModelCategoryId, ct);
                }

                return missing.Count > 0
                    ? $"Model already present (deduplicated by store item); gap-filled {missing.Count} missing file(s)."
                    : "Model already present (deduplicated by store item).";
            }

            case StoreManifestMapping.ImportTarget.TextureSet when asset is TextureSet textureSet:
            {
                var have = textureSet.Textures
                    .Where(t => t.File is not null)
                    .Select(t => t.File!.Sha256Hash)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                var missing = files.Where(f => f.Sha256 is null || !have.Contains(f.Sha256)).ToList();

                foreach (var file in missing)
                {
                    var role = StoreManifestMapping.ParseRole(file.Role);
                    var download = RequireStagedDownload(stagedDownloads, file);
                    var fileId = await _sink.UploadTextureFileAsync(textureSet.Id, download.ToUpload(file.FileName), ct);
                    await _sink.AddTextureAsync(textureSet.Id, fileId, role.TextureType, role.SourceChannel, ct);
                }

                await _sink.AddTextureSetToPackAsync(packId, textureSet.Id, ct);
                if (textureSet.TextureSetCategoryId is null && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.TextureSet, item, ct) is int gapFillCat)
                {
                    await _sink.SetTextureSetCategoryAsync(textureSet.Id, textureSet.Name, gapFillCat, ct);
                }

                return missing.Count > 0
                    ? $"Texture set already present (deduplicated by store item); gap-filled {missing.Count} missing texture(s)."
                    : "Texture set already present (deduplicated by store item).";
            }

            case StoreManifestMapping.ImportTarget.Sound when asset is Sound sound:
            {
                await _sink.AddSoundToPackAsync(packId, sound.Id, ct);
                if (sound.SoundCategoryId is null && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sound, item, ct) is int gapFillCat)
                {
                    await _sink.SetSoundCategoryAsync(sound.Id, gapFillCat, ct);
                }
                return Append("Sound already present (deduplicated by store item).", extraNote) ?? "Sound already present.";
            }

            case StoreManifestMapping.ImportTarget.Sprite when asset is Sprite sprite:
            {
                await _sink.AddSpriteToPackAsync(packId, sprite.Id, ct);
                if (sprite.SpriteCategoryId is null && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sprite, item, ct) is int gapFillCat)
                {
                    await _sink.SetSpriteCategoryAsync(sprite.Id, gapFillCat, ct);
                }
                return Append("Sprite already present (deduplicated by store item).", extraNote) ?? "Sprite already present.";
            }

            case StoreManifestMapping.ImportTarget.EnvironmentMap when asset is EnvironmentMap env:
            {
                await _sink.AddEnvironmentMapToPackAsync(packId, env.Id, ct);
                if (env.EnvironmentMapCategoryId is null && await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.EnvironmentMap, item, ct) is int gapFillCat)
                {
                    await _sink.SetEnvironmentMapCategoryAsync(env.Id, gapFillCat, ct);
                }
                return Append("Environment map already present (deduplicated by store item).", extraNote) ?? "Environment map already present.";
            }

            default:
                return $"{item.ItemType} already present.";
        }
    }

    private async Task<int> CreateModelFromStagedAsync(
        int packId,
        StoreManifestItem item,
        IReadOnlyList<StoreManifestFile> files,
        StoreManifestFile primary,
        string[] tags,
        string? batchId,
        Dictionary<StoreManifestFile, StoreDownloadedFile> stagedDownloads,
        StoreDownloadedFile? thumbnailDownload,
        StoreManifestPreview? reusablePreview,
        StoreManifest manifest,
        CancellationToken ct)
    {
        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Model, item, ct);
        var primaryDownload = RequireStagedDownload(stagedDownloads, primary);

        var modelId = await _sink.CreateModelAsync(
            primaryDownload.ToUpload(primary.FileName),
            item.Name,
            batchId,
            generateThumbnail: thumbnailDownload is null,
            ct);

        foreach (var file in files)
        {
            if (ReferenceEquals(file, primary))
                continue;

            var extraDl = RequireStagedDownload(stagedDownloads, file);
            await _sink.AddFileToModelAsync(modelId, extraDl.ToUpload(file.FileName), ct);
        }

        var description = StoreManifestMapping.ResolveItemDescription(item, manifest);

        if (tags.Length > 0 || categoryId.HasValue || !string.IsNullOrWhiteSpace(description))
        {
            await _sink.SetModelTagsAsync(modelId, tags, description, categoryId, ct);
        }

        await _sink.AddModelToPackAsync(packId, modelId, ct);

        if (thumbnailDownload is not null && reusablePreview is not null)
        {
            await AttachStoreThumbnailBestEffortAsync(modelId, reusablePreview, thumbnailDownload, ct);
        }

        return modelId;
    }

    private async Task<int> CreateTextureSetFromStagedAsync(
        int packId,
        StoreManifestItem item,
        IReadOnlyList<StoreManifestFile> files,
        string[] tags,
        string? batchId,
        Dictionary<StoreManifestFile, StoreDownloadedFile> stagedDownloads,
        CancellationToken ct)
    {
        var first = files[0];
        var firstRole = StoreManifestMapping.ParseRole(first.Role);
        if (firstRole.TextureTypeUnmapped)
        {
            _logger.LogWarning("Store import: texture role '{Role}' not mapped; importing '{File}' as Albedo", first.Role, first.FileName);
        }

        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.TextureSet, item, ct);
        var firstDownload = RequireStagedDownload(stagedDownloads, first);

        var setId = await _sink.CreateTextureSetAsync(
            firstDownload.ToUpload(first.FileName),
            item.Name,
            firstRole.TextureType,
            batchId,
            categoryId,
            ct);

        foreach (var file in files.Skip(1))
        {
            var role = StoreManifestMapping.ParseRole(file.Role);
            var dl = RequireStagedDownload(stagedDownloads, file);
            var fileId = await _sink.UploadTextureFileAsync(setId, dl.ToUpload(file.FileName), ct);
            await _sink.AddTextureAsync(setId, fileId, role.TextureType, role.SourceChannel, ct);
        }

        if (tags.Length > 0)
        {
            await _sink.SetTextureSetTagsAsync(setId, tags, ct);
        }

        await _sink.AddTextureSetToPackAsync(packId, setId, ct);
        return setId;
    }

    private async Task<int> CreateSoundFromStagedAsync(
        int packId,
        StoreManifestItem item,
        StoreManifestFile primary,
        string[] tags,
        string? batchId,
        Dictionary<StoreManifestFile, StoreDownloadedFile> stagedDownloads,
        CancellationToken ct)
    {
        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sound, item, ct);
        var download = RequireStagedDownload(stagedDownloads, primary);

        var soundId = await _sink.CreateSoundAsync(
            download.ToUpload(primary.FileName),
            item.Name,
            batchId,
            categoryId,
            ct);

        if (tags.Length > 0)
        {
            await _sink.SetSoundTagsAsync(soundId, tags, item.Name, ct);
        }

        await _sink.AddSoundToPackAsync(packId, soundId, ct);
        return soundId;
    }

    private async Task<int> CreateSpriteFromStagedAsync(
        int packId,
        StoreManifestItem item,
        StoreManifestFile primary,
        string[] tags,
        string? batchId,
        Dictionary<StoreManifestFile, StoreDownloadedFile> stagedDownloads,
        CancellationToken ct)
    {
        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.Sprite, item, ct);
        var download = RequireStagedDownload(stagedDownloads, primary);

        var spriteId = await _sink.CreateSpriteAsync(
            download.ToUpload(primary.FileName),
            item.Name,
            batchId,
            categoryId,
            ct);

        if (tags.Length > 0)
        {
            await _sink.SetSpriteTagsAsync(spriteId, tags, item.Name, ct);
        }

        await _sink.AddSpriteToPackAsync(packId, spriteId, ct);
        return spriteId;
    }

    private async Task<int> CreateEnvironmentMapFromStagedAsync(
        int packId,
        StoreManifestItem item,
        StoreManifestFile primary,
        string? batchId,
        Dictionary<StoreManifestFile, StoreDownloadedFile> stagedDownloads,
        CancellationToken ct)
    {
        var categoryId = await ResolveCategoryAsync(StoreManifestMapping.ImportTarget.EnvironmentMap, item, ct);
        var download = RequireStagedDownload(stagedDownloads, primary);

        var envMapId = await _sink.CreateEnvironmentMapAsync(
            download.ToUpload(primary.FileName),
            item.Name,
            batchId,
            ct);

        if (categoryId.HasValue)
        {
            await _sink.SetEnvironmentMapCategoryAsync(envMapId, categoryId.Value, ct);
        }

        await _sink.AddEnvironmentMapToPackAsync(packId, envMapId, ct);
        return envMapId;
    }

    private static StoreDownloadedFile RequireStagedDownload(
        IReadOnlyDictionary<StoreManifestFile, StoreDownloadedFile> stagedDownloads,
        StoreManifestFile file)
    {
        if (stagedDownloads.TryGetValue(file, out var download))
            return download;

        // The optimistic read and locked re-check observed different database state.
        // Never repair that race by performing network I/O while holding the transaction
        // and advisory lock: roll back this item and let a later import stage it cleanly.
        throw new StoreImportException(
            $"Store item state changed while '{file.FileName}' was being staged; retry the import.");
    }

    private Task<int?> ResolveCategoryAsync(StoreManifestMapping.ImportTarget target, StoreManifestItem item, CancellationToken ct)
        => _categoryResolver.ResolveAsync(
            target,
            StoreManifestMapping.ResolveItemCategory(item),
            StoreManifestMapping.ResolveItemSubcategory(item),
            ct);

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

    private static StoreManifestFile PickPrimary(IReadOnlyList<StoreManifestFile> files, StoreManifestMapping.RoleKind preferred)
        => files.FirstOrDefault(f => StoreManifestMapping.ParseRole(f.Role).Kind == preferred) ?? files[0];

    private static string? ExtraFilesNote(IReadOnlyList<StoreManifestFile> files, string assetTypeName)
        => files.Count > 1 && !string.IsNullOrWhiteSpace(assetTypeName)
            ? $"{files.Count - 1} additional file(s) not imported - {assetTypeName} are single-file assets in Modelibr."
            : null;

    private static string? Append(string reason, string? note)
        => note is null ? reason : $"{reason} {note}";

    private static StoreImportItemResult Created(
        StoreManifestItem item, string assetType, int assetId, string? reason = null)
        => new(item.ItemType, item.Name, OutcomeCreated, reason, assetType, assetId);

    private static StoreImportItemResult Skipped(
        StoreManifestItem item, string outcome, string reason, string? assetType = null, int? assetId = null)
        => new(item.ItemType, item.Name, outcome, reason, assetType, assetId);

    private static string BuildListingUrl(string storeUrl, string assetId)
        => $"{storeUrl.TrimEnd('/')}/assets/{assetId}";

    private static string Serialize(IReadOnlyList<StoreImportItemResult> results)
        => JsonSerializer.Serialize(results);
}
