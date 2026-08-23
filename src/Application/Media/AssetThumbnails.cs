using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;

namespace Application.Media;

/// <summary>One asset to look a picture up for. The version matters where a family has versions.</summary>
public sealed record AssetThumbnailRef(string AssetType, int AssetId, int? VersionId = null)
{
    /// <summary>Stable key for looking the answer back up. Case-insensitive on the family, as every other asset key here is.</summary>
    public string Key => $"{AssetType.ToLowerInvariant()}:{AssetId}:{VersionId?.ToString() ?? "-"}";
}

/// <summary>Where a picture stands. A missing one is a normal state, never a broken image.</summary>
public static class AssetThumbnailStatuses
{
    public const string Ready = "ready";

    /// <summary>Being rendered - come back.</summary>
    public const string Pending = "pending";

    /// <summary>This family has no picture to give.</summary>
    public const string None = "none";

    /// <summary>The asset itself, or the version asked for, could not be read.</summary>
    public const string Unknown = "unknown";
}

/// <summary>An API-relative picture URL, or the reason there is not one.</summary>
public sealed record AssetThumbnail(string? Url, string Status);

/// <summary>
/// One place that turns an asset reference into a picture URL.
///
/// It exists because two surfaces answer the same question and must not disagree about it:
/// a search hit and a choice card can name the same pinned asset, and a user who sees a
/// thumbnail on one and a fallback tile on the other has been told the library is in two
/// states at once. Resolved in batches, always - the rule both callers keep is that reading
/// a page of results is one request, not one per result.
/// </summary>
public interface IAssetThumbnails
{
    /// <summary>
    /// A picture for each distinct reference, keyed by <see cref="AssetThumbnailRef.Key"/>.
    /// References that resolve to nothing are present with a status, not absent: "no picture"
    /// and "not looked up" are different answers and only one of them deserves a fallback.
    /// </summary>
    Task<IReadOnlyDictionary<string, AssetThumbnail>> ResolveAsync(
        IEnumerable<AssetThumbnailRef> assets,
        CancellationToken cancellationToken = default);
}

internal sealed class AssetThumbnailProvider : IAssetThumbnails
{
    private const string Model = "Model";
    private const string Sprite = "Sprite";
    private const string EnvironmentMap = "EnvironmentMap";

    private readonly IModelVersionRepository _modelVersions;
    private readonly ISpriteRepository _sprites;
    private readonly IEnvironmentMapRepository _environmentMaps;

    public AssetThumbnailProvider(
        IModelVersionRepository modelVersions,
        ISpriteRepository sprites,
        IEnvironmentMapRepository environmentMaps)
    {
        _modelVersions = modelVersions;
        _sprites = sprites;
        _environmentMaps = environmentMaps;
    }

    public async Task<IReadOnlyDictionary<string, AssetThumbnail>> ResolveAsync(
        IEnumerable<AssetThumbnailRef> assets,
        CancellationToken cancellationToken = default)
    {
        var distinct = (assets ?? [])
            .Where(a => a is not null && !string.IsNullOrWhiteSpace(a.AssetType))
            .DistinctBy(a => a.Key, StringComparer.Ordinal)
            .ToList();

        var resolved = new Dictionary<string, AssetThumbnail>(StringComparer.Ordinal);
        if (distinct.Count == 0)
        {
            return resolved;
        }

        var versionIds = Ids(distinct.Where(a => Is(a, Model)).Select(a => a.VersionId));
        var spriteIds = Ids(distinct.Where(a => Is(a, Sprite)).Select(a => (int?)a.AssetId));
        var environmentMapIds = Ids(distinct.Where(a => Is(a, EnvironmentMap)).Select(a => (int?)a.AssetId));

        var versions = versionIds.Count == 0
            ? Array.Empty<ModelVersion>()
            : await _modelVersions.GetWithThumbnailsByIdsAsync(versionIds, cancellationToken);

        var sprites = spriteIds.Count == 0
            ? Array.Empty<Sprite>()
            : await _sprites.GetByIdsAsync(spriteIds, cancellationToken);

        var environmentMaps = environmentMapIds.Count == 0
            ? Array.Empty<EnvironmentMap>()
            : await _environmentMaps.GetByIdsAsync(environmentMapIds, cancellationToken);

        var versionsById = versions.ToDictionary(v => v.Id);
        var spritesById = sprites.ToDictionary(s => s.Id);
        var environmentMapsById = environmentMaps.ToDictionary(e => e.Id);

        foreach (var asset in distinct)
        {
            resolved[asset.Key] = Describe(asset, versionsById, spritesById, environmentMapsById);
        }

        return resolved;
    }

    private static AssetThumbnail Describe(
        AssetThumbnailRef asset,
        IReadOnlyDictionary<int, ModelVersion> versions,
        IReadOnlyDictionary<int, Sprite> sprites,
        IReadOnlyDictionary<int, EnvironmentMap> environmentMaps)
    {
        if (Is(asset, Model))
        {
            // Pinned to the reference's own version. A model reference that names no version
            // is answered "unknown" rather than being resolved to the active one: both
            // callers here - a search hit and a choice card - always carry the version they
            // are arguing for, and showing a different version's picture would be arguing
            // for an asset nobody is about to get.
            if (asset.VersionId is not { } versionId || !versions.TryGetValue(versionId, out var version))
            {
                return new AssetThumbnail(null, AssetThumbnailStatuses.Unknown);
            }

            var thumbnail = version.Thumbnail;
            if (thumbnail?.Status != ThumbnailStatus.Ready)
            {
                return new AssetThumbnail(
                    null,
                    thumbnail is null ? AssetThumbnailStatuses.None : AssetThumbnailStatuses.Pending);
            }

            return new AssetThumbnail(
                $"/model-versions/{version.Id}/thumbnail/file?t={thumbnail.UpdatedAt:yyyyMMddHHmmss}",
                AssetThumbnailStatuses.Ready);
        }

        if (Is(asset, Sprite))
        {
            return sprites.TryGetValue(asset.AssetId, out var sprite)
                ? new AssetThumbnail($"/files/{sprite.FileId}/preview?channel=rgb", AssetThumbnailStatuses.Ready)
                : new AssetThumbnail(null, AssetThumbnailStatuses.Unknown);
        }

        if (Is(asset, EnvironmentMap))
        {
            return environmentMaps.TryGetValue(asset.AssetId, out var map)
                ? new AssetThumbnail(
                    $"/environment-maps/{map.Id}/preview?v={map.UpdatedAt.Ticks}", AssetThumbnailStatuses.Ready)
                : new AssetThumbnail(null, AssetThumbnailStatuses.Unknown);
        }

        // Sounds, texture sets and materials have no per-asset render of their own here.
        // "None" rather than "unknown": there is nothing to wait for.
        return new AssetThumbnail(null, AssetThumbnailStatuses.None);
    }

    private static bool Is(AssetThumbnailRef asset, string family) =>
        string.Equals(asset.AssetType, family, StringComparison.OrdinalIgnoreCase);

    private static List<int> Ids(IEnumerable<int?> ids) =>
        ids.Where(id => id is > 0).Select(id => id!.Value).Distinct().ToList();
}
