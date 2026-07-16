using Application.Abstractions.Files;
using Domain.ValueObjects;

namespace Application.StoreImports;

/// <summary>
/// Thin 1:1 adapter over Modelibr's existing Application command handlers, expressed in terms
/// the store importer needs. It exists so the processor can hold its orchestration policy
/// (dedupe, provenance, hashing, mapping, progress) and delegate the "create X and add to
/// pack" plumbing here — no parallel persistence path, every method replays through the same
/// handler the UI uses. Each method throws <see cref="StoreImportException"/> when the
/// underlying handler returns a failure Result.
/// </summary>
public interface IStoreImportSink
{
    // Pack.
    Task<int> CreatePackAsync(string name, string? description, string? licenseType, string? url, CancellationToken ct);
    Task RecordPackProvenanceAsync(int packId, string storeUrl, string storeAssetId, int manifestVersion, CancellationToken ct);
    Task SetPackThumbnailFromFileAsync(int packId, IFileUpload file, CancellationToken ct);

    // Model → CreateModel (first mesh) / AddFileToModel (extras) / UpdateModelTags / AddModelToPack.
    Task<int> CreateModelAsync(IFileUpload primaryFile, string name, CancellationToken ct);
    Task AddFileToModelAsync(int modelId, IFileUpload file, CancellationToken ct);
    Task SetModelTagsAsync(int modelId, IReadOnlyCollection<string> tags, string description, CancellationToken ct);
    Task AddModelToPackAsync(int packId, int modelId, CancellationToken ct);

    // TextureSet → CreateTextureSetWithFile (first) / UploadFile + AddTextureToSet (rest) / tags / AddTextureSetToPack.
    Task<int> CreateTextureSetAsync(IFileUpload firstFile, string name, TextureType textureType, CancellationToken ct);
    Task<int> UploadTextureFileAsync(int textureSetId, IFileUpload file, CancellationToken ct);
    Task AddTextureAsync(int textureSetId, int fileId, TextureType textureType, TextureChannel? sourceChannel, CancellationToken ct);
    Task SetTextureSetTagsAsync(int textureSetId, IReadOnlyCollection<string> tags, CancellationToken ct);
    Task AddTextureSetToPackAsync(int packId, int textureSetId, CancellationToken ct);

    // Sound / Sprite / EnvironmentMap → *WithFile create + add-to-pack.
    Task<int> CreateSoundAsync(IFileUpload file, string name, CancellationToken ct);
    Task AddSoundToPackAsync(int packId, int soundId, CancellationToken ct);
    Task<int> CreateSpriteAsync(IFileUpload file, string name, CancellationToken ct);
    Task AddSpriteToPackAsync(int packId, int spriteId, CancellationToken ct);
    Task<int> CreateEnvironmentMapAsync(IFileUpload file, string name, CancellationToken ct);
    Task AddEnvironmentMapToPackAsync(int packId, int environmentMapId, CancellationToken ct);
}
