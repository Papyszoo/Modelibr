namespace Domain.Models;

/// <summary>
/// Tracks the provenance relationship between an item imported from the Asset Store
/// and the local Modelibr asset created or reused for it.
/// </summary>
/// <remarks>
/// <para>
/// Multi-file assets (Model, TextureSet) have a 1:1 identity with their store item.
/// Single-file assets (Sound, Sprite, EnvironmentMap) deduplicate by SHA-256 across
/// store items, so multiple <see cref="StoreImportedItem"/> rows can point to the same
/// local asset ID with different (StoreUrl, StoreAssetId, StoreItemId) triples.
/// </para>
/// <para>
/// Uniqueness is enforced on (StoreUrl, StoreAssetId, StoreItemId).
/// </para>
/// </remarks>
public class StoreImportedItem
{
    public int Id { get; private set; }

    /// <summary>Canonical base URL of the store the item was imported from.</summary>
    public string StoreUrl { get; private set; } = string.Empty;

    /// <summary>Store asset/pack ID (GUID or slug string).</summary>
    public string StoreAssetId { get; private set; } = string.Empty;

    /// <summary>Item ID within the store pack manifest.</summary>
    public string StoreItemId { get; private set; } = string.Empty;

    /// <summary>The local asset family ("Model", "TextureSet", "Sound", "Sprite", "EnvironmentMap").</summary>
    public string AssetType { get; private set; } = string.Empty;

    /// <summary>The local database ID of the asset.</summary>
    public int AssetId { get; private set; }

    public DateTime CreatedAt { get; private set; }

    private StoreImportedItem() { }

    public static StoreImportedItem Create(
        string storeUrl,
        string storeAssetId,
        string storeItemId,
        string assetType,
        int assetId,
        DateTime createdAt)
    {
        if (string.IsNullOrWhiteSpace(storeUrl))
            throw new ArgumentException("Store URL cannot be null or empty.", nameof(storeUrl));
        if (storeUrl.Length > 2048)
            throw new ArgumentException("Store URL cannot exceed 2048 characters.", nameof(storeUrl));
        if (string.IsNullOrWhiteSpace(storeAssetId))
            throw new ArgumentException("Store asset ID cannot be null or empty.", nameof(storeAssetId));
        if (storeAssetId.Length > 200)
            throw new ArgumentException("Store asset ID cannot exceed 200 characters.", nameof(storeAssetId));
        if (string.IsNullOrWhiteSpace(storeItemId))
            throw new ArgumentException("Store item ID cannot be null or empty.", nameof(storeItemId));
        if (storeItemId.Length > 200)
            throw new ArgumentException("Store item ID cannot exceed 200 characters.", nameof(storeItemId));
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or empty.", nameof(assetType));
        if (assetType.Length > 50)
            throw new ArgumentException("Asset type cannot exceed 50 characters.", nameof(assetType));
        if (assetId <= 0)
            throw new ArgumentException("Asset ID must be positive.", nameof(assetId));

        return new StoreImportedItem
        {
            StoreUrl = storeUrl.Trim(),
            StoreAssetId = storeAssetId.Trim(),
            StoreItemId = storeItemId.Trim(),
            AssetType = assetType.Trim(),
            AssetId = assetId,
            CreatedAt = createdAt
        };
    }
}
