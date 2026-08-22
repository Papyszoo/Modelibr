using Application.Abstractions.Files;
using Domain.ValueObjects;

namespace Application.StoreImports;

/// <summary>
/// Thin 1:1 adapter over Modelibr's existing Application command handlers, expressed in terms
/// the store importer needs. It exists so the processor can hold its orchestration policy
/// (dedupe, provenance, hashing, mapping, progress) and delegate the "create X and add to
/// pack" plumbing here - no parallel persistence path, every method replays through the same
/// handler the UI uses. Each method throws <see cref="StoreImportException"/> when the
/// underlying handler returns a failure Result.
/// </summary>
public interface IStoreImportSink
{
    // Pack.
    /// <summary>
    /// Creates the pack AND stamps its store provenance in one transaction - the
    /// (storeUrl, storeAssetId) pair is the re-import idempotency key, so a pack must never be
    /// visible without it. <see cref="RecordPackProvenanceAsync"/> only re-stamps packs that
    /// already exist.
    /// </summary>
    Task<int> CreatePackAsync(
        string name, string? description, string? licenseType, string? url,
        string storeUrl, string storeAssetId, int manifestVersion, CancellationToken ct);
    Task RecordPackProvenanceAsync(int packId, string storeUrl, string storeAssetId, int manifestVersion, CancellationToken ct);
    Task SetPackThumbnailFromFileAsync(int packId, IFileUpload file, CancellationToken ct);

    // Model → CreateModel (first mesh) / AddFileToModel (extras) / UpdateModelTags / AddModelToPack.
    // batchId groups every asset from one import into a single upload-history batch.
    // generateThumbnail=false when the caller will attach the store's rendered thumbnail instead.
    Task<int> CreateModelAsync(IFileUpload primaryFile, string name, string? batchId, bool generateThumbnail, CancellationToken ct);
    Task AddFileToModelAsync(int modelId, IFileUpload file, CancellationToken ct);
    Task SetModelTagsAsync(int modelId, IReadOnlyCollection<string> tags, string description, int? categoryId, CancellationToken ct);
    Task AddModelToPackAsync(int packId, int modelId, CancellationToken ct);
    /// <summary>Attaches a store-provided thumbnail image to the model's active version (reuses UploadThumbnailCommand).</summary>
    Task SetModelThumbnailFromFileAsync(int modelId, IFileUpload thumbnailFile, CancellationToken ct);

    // TextureSet → CreateTextureSetWithFile (first) / UploadFile + AddTextureToSet (rest) / tags / AddTextureSetToPack.
    // categoryId (here and below) comes from IStoreImportCategoryResolver; null = uncategorized.
    Task<int> CreateTextureSetAsync(IFileUpload firstFile, string name, TextureType textureType, string? batchId, int? categoryId, CancellationToken ct);
    Task<int> UploadTextureFileAsync(int textureSetId, IFileUpload file, CancellationToken ct);
    Task AddTextureAsync(int textureSetId, int fileId, TextureType textureType, TextureChannel? sourceChannel, CancellationToken ct);
    Task SetTextureSetTagsAsync(int textureSetId, IReadOnlyCollection<string> tags, CancellationToken ct);
    Task AddTextureSetToPackAsync(int packId, int textureSetId, CancellationToken ct);

    // Sound / Sprite / EnvironmentMap → *WithFile create + add-to-pack. Sounds and sprites
    // take the category at creation; environment maps only support it via metadata update.
    Task<int> CreateSoundAsync(IFileUpload file, string name, string? batchId, int? categoryId, CancellationToken ct);
    Task AddSoundToPackAsync(int packId, int soundId, CancellationToken ct);
    Task<int> CreateSpriteAsync(IFileUpload file, string name, string? batchId, int? categoryId, CancellationToken ct);
    Task AddSpriteToPackAsync(int packId, int spriteId, CancellationToken ct);

    // Tags + description for the two families that could not carry them until prompt 16-D.
    // The manifest has always sent tags; sounds and sprites had nowhere to put them, which
    // for a 4,000-sound CC0 pack meant every clip arrived describing itself by filename only.
    Task SetSoundTagsAsync(int soundId, IReadOnlyCollection<string> tags, string? description, CancellationToken ct);
    Task SetSpriteTagsAsync(int spriteId, IReadOnlyCollection<string> tags, string? description, CancellationToken ct);
    Task<int> CreateEnvironmentMapAsync(IFileUpload file, string name, string? batchId, CancellationToken ct);
    Task AddEnvironmentMapToPackAsync(int packId, int environmentMapId, CancellationToken ct);

    /// <summary>
    /// Stamps the asset metadata schema's rights and provenance blocks onto an imported
    /// asset (prompt 16-E). Rights are <b>gap-fill</b> - a licence or credit already on the
    /// asset is never overwritten, matching the category policy below - while the store
    /// identity and the import timestamp are facts about this run and are always re-stamped.
    /// Best-effort: a failure here must not fail an item whose files imported fine.
    /// </summary>
    Task StampAssetMetadataAsync(
        string assetType, int assetId, StoreAssetMetadataStamp stamp, CancellationToken ct);

    // Category assignment on EXISTING assets - used by the dedupe gap-fill (re-running an
    // import categorizes assets that predate category support) and by env-map creation
    // (whose create command has no category parameter). Each implementation preserves the
    // asset's other user-editable metadata: models/env maps re-send their current tags and
    // description through the combined update commands; sounds/sprites/texture sets use
    // updates whose omitted fields mean "unchanged".
    Task SetModelCategoryAsync(int modelId, int categoryId, CancellationToken ct);
    Task SetTextureSetCategoryAsync(int textureSetId, string currentName, int categoryId, CancellationToken ct);
    Task SetSoundCategoryAsync(int soundId, int categoryId, CancellationToken ct);
    Task SetSpriteCategoryAsync(int spriteId, int categoryId, CancellationToken ct);
    Task SetEnvironmentMapCategoryAsync(int environmentMapId, int categoryId, CancellationToken ct);
}

/// <summary>What one import knows about an asset's rights and where it came from.</summary>
/// <param name="FacetsJson">
/// Per-family extras copied verbatim from the store item's metadata, as a JSON object -
/// today the sprite frame grid. Null when the item carried none.
/// </param>
public sealed record StoreAssetMetadataStamp(
    string? License,
    string? LicenseName,
    string? Author,
    string? CreditName,
    string? CreditUrl,
    bool? AttributionRequired,
    string? SourceUrl,
    string StoreUrl,
    string StoreAssetId,
    string? StoreItemId,
    DateTime ImportedAt,
    string? FacetsJson = null);
