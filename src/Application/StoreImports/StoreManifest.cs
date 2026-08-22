namespace Application.StoreImports;

/// <summary>
/// Store asset manifest (schema v1) as pulled from
/// <c>GET {storeUrl}/api/assets/{id}/manifest</c>. Field names mirror the store's
/// camelCase JSON (see ModelibrStore docs/INTEGRATION.md and the manifest DTOs); the
/// client deserializes case-insensitively. URLs are absolute.
/// </summary>
public sealed record StoreManifest(
    int SchemaVersion,
    string? Title,
    string? Description,
    string? License,
    IReadOnlyList<string>? Tags,
    IReadOnlyList<StoreManifestItem>? Items,
    IReadOnlyList<StoreManifestPreview>? Previews,
    // Attribution. The manifest has carried these since schema v1 and the importer read
    // none of them, so a CC-BY asset imported with nothing on it saying who to credit.
    // Author is who made it; CreditName/CreditUrl are how the source asks to be credited,
    // which is not always the same name.
    string? Author = null,
    string? CreditName = null,
    string? CreditUrl = null);

public sealed record StoreManifestItem(
    string ItemType,
    string Name,
    IReadOnlyList<StoreManifestFile>? Files,
    IReadOnlyList<StoreManifestPreview>? Previews,
    // Store pack-item id (Guid string). Used to scope a partial import to selected items;
    // null on manifests that predate item ids (whole pack imports unaffected).
    string? Id = null,
    // Item metadata JSON as stored by the store; today its only contract key is
    // "category" (taxonomy v1 name), read via StoreManifestMapping.GetItemCategory.
    string? MetadataJson = null);

public sealed record StoreManifestFile(
    string FileName,
    long FileSize,
    string Sha256,
    string? Role,
    string DownloadUrl);

public sealed record StoreManifestPreview(
    string? Type,
    string FileName,
    string? ContentType,
    string Url);
