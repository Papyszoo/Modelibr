using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Scenes;
using Domain.ValueObjects;

namespace Application.Scenes;

/// <summary>
/// The picture on a choice card (v0.6 prompt 14, part B).
///
/// Slots shipped without media on purpose - a card that argues from numbers is harder to
/// wave through than one that argues from a thumbnail. The numbers stay; the picture is what
/// makes a page of six candidates scannable, and what makes a store proposal legible at all,
/// since a store asset has no local anything to look at.
///
/// Resolved on the server, in batches, for the whole document at once. The rule this exists
/// to keep is the one a per-card <c>useQueries</c> would break: reading a scene's slots is
/// one request, not one request per proposal.
/// </summary>
public interface ISceneCandidateMedia
{
    /// <summary>
    /// Media for every candidate in <paramref name="document"/>, keyed by the candidate's
    /// <c>slotId/candidateId</c> ref. A candidate with nothing to show is absent rather than
    /// present-and-empty, so the card can tell "no picture" from "not looked up".
    /// </summary>
    Task<IReadOnlyDictionary<string, SceneCandidateMedia>> ResolveAsync(
        SceneDocument document,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// What a card can draw for one candidate.
///
/// Both halves can be present at once, because a candidate can be an asset <i>and</i> a
/// surface for it: the asset is the primary picture and the material sits beside it. A
/// surface-only candidate has only the material half, and that is its primary picture.
/// </summary>
/// <param name="AssetThumbnailUrl">API-relative, never a storage path. Null unless the status is ready.</param>
/// <param name="AssetThumbnailStatus">
/// <c>ready</c>, <c>pending</c> (being rendered - come back), <c>none</c> (this family has no
/// picture to give) or <c>unknown</c> (the asset itself could not be read). A missing
/// thumbnail is a normal state, not a broken image.
/// </param>
/// <param name="MaterialThumbnailUrl">A global material's rendered swatch, when it has one.</param>
/// <param name="MaterialSwatch">
/// A parameter-only material's scalars, for the CSS swatch the materials feature already
/// draws. Cheaper and more honest than rendering a sphere per card.
/// </param>
/// <param name="StoreThumbnailUrl">
/// An absolute store URL, copied into the scene when the candidate was proposed. Absolute
/// because it points at another host, and copied because the card must still draw when that
/// host is down.
/// </param>
public sealed record SceneCandidateMedia(
    string? AssetThumbnailUrl = null,
    string AssetThumbnailStatus = SceneCandidateMediaStatus.Unknown,
    string? MaterialThumbnailUrl = null,
    SceneMaterialSwatch? MaterialSwatch = null,
    string? StoreThumbnailUrl = null);

public static class SceneCandidateMediaStatus
{
    public const string Ready = "ready";
    public const string Pending = "pending";
    public const string None = "none";
    public const string Unknown = "unknown";
}

/// <summary>The four scalars the existing MaterialSwatch component approximates a surface from.</summary>
public sealed record SceneMaterialSwatch(
    string BaseColorHex,
    double Roughness,
    double Metallic,
    double Opacity);

internal sealed class SceneCandidateMediaProvider : ISceneCandidateMedia
{
    private readonly IModelVersionRepository _modelVersions;
    private readonly ISpriteRepository _sprites;
    private readonly IEnvironmentMapRepository _environmentMaps;
    private readonly IMaterialRepository _materials;
    private readonly ITextureSetRepository _textureSets;

    public SceneCandidateMediaProvider(
        IModelVersionRepository modelVersions,
        ISpriteRepository sprites,
        IEnvironmentMapRepository environmentMaps,
        IMaterialRepository materials,
        ITextureSetRepository textureSets)
    {
        _modelVersions = modelVersions;
        _sprites = sprites;
        _environmentMaps = environmentMaps;
        _materials = materials;
        _textureSets = textureSets;
    }

    public async Task<IReadOnlyDictionary<string, SceneCandidateMedia>> ResolveAsync(
        SceneDocument document,
        CancellationToken cancellationToken = default)
    {
        var slots = document.Slots ?? Array.Empty<SceneSlot>();
        var candidates = slots
            .SelectMany(slot => slot.Candidates.Select(candidate => (Slot: slot, Candidate: candidate)))
            .ToList();

        if (candidates.Count == 0)
        {
            return new Dictionary<string, SceneCandidateMedia>(StringComparer.Ordinal);
        }

        // One read per family for the whole document, not one per card.
        var versionIds = Distinct(candidates
            .Where(c => c.Candidate.Asset?.AssetType == SceneAssetTypes.Model)
            .Select(c => c.Candidate.Asset!.VersionId));
        var spriteIds = Distinct(candidates
            .Where(c => c.Candidate.Asset?.AssetType == SceneAssetTypes.Sprite)
            .Select(c => (int?)c.Candidate.Asset!.AssetId));
        var environmentMapIds = Distinct(candidates
            .Where(c => c.Candidate.Asset?.AssetType == SceneAssetTypes.EnvironmentMap)
            .Select(c => (int?)c.Candidate.Asset!.AssetId));
        var materialIds = Distinct(candidates.Select(c => c.Candidate.Material?.MaterialId));
        var textureSetIds = Distinct(candidates.Select(c => c.Candidate.Material?.TextureSetId));

        var versions = versionIds.Count == 0
            ? Array.Empty<ModelVersion>()
            : await _modelVersions.GetWithThumbnailsByIdsAsync(versionIds, cancellationToken);
        var sprites = spriteIds.Count == 0
            ? Array.Empty<Sprite>()
            : await _sprites.GetByIdsAsync(spriteIds, cancellationToken);
        var environmentMaps = environmentMapIds.Count == 0
            ? Array.Empty<EnvironmentMap>()
            : await _environmentMaps.GetByIdsAsync(environmentMapIds, cancellationToken);
        var materials = materialIds.Count == 0
            ? Array.Empty<Material>()
            : await _materials.GetByIdsAsync(materialIds, cancellationToken);
        var textureSets = textureSetIds.Count == 0
            ? Array.Empty<TextureSet>()
            : await _textureSets.GetByIdsAsync(textureSetIds, cancellationToken);

        var versionsById = versions.ToDictionary(v => v.Id);
        var spritesById = sprites.ToDictionary(s => s.Id);
        var environmentMapsById = environmentMaps.ToDictionary(e => e.Id);
        var materialsById = materials.ToDictionary(m => m.Id);
        var textureSetsById = textureSets.ToDictionary(t => t.Id);

        var media = new Dictionary<string, SceneCandidateMedia>(StringComparer.Ordinal);

        foreach (var (slot, candidate) in candidates)
        {
            var (assetUrl, assetStatus) = candidate.Asset is null
                ? (null, SceneCandidateMediaStatus.Unknown)
                : DescribeAsset(candidate.Asset, versionsById, spritesById, environmentMapsById);

            string? materialUrl = null;
            SceneMaterialSwatch? swatch = null;

            if (candidate.Material?.TextureSetId is { } textureSetId
                && textureSetsById.TryGetValue(textureSetId, out var textureSet)
                && !string.IsNullOrWhiteSpace(textureSet.ThumbnailPath))
            {
                materialUrl = $"/texture-sets/{textureSet.Id}/thumbnail/file";
            }

            if (candidate.Material?.MaterialId is { } materialId
                && materialsById.TryGetValue(materialId, out var material))
            {
                // A rendered swatch when the material has one, the scalars when it does not.
                // Both are cheap; neither is a WebGL canvas per card.
                if (!string.IsNullOrWhiteSpace(material.ThumbnailPath))
                {
                    materialUrl ??= $"/materials/{material.Id}/thumbnail/file";
                }

                swatch = Swatch(material.Parameters);
            }

            var entry = new SceneCandidateMedia(
                assetUrl,
                assetStatus,
                materialUrl,
                swatch,
                candidate.StoreAsset?.ThumbnailUrl);

            // Absent rather than empty: "no picture anywhere" and "not resolved" read the
            // same on a card, and only one of them is worth a fallback tile.
            if (entry.AssetThumbnailUrl is not null
                || entry.MaterialThumbnailUrl is not null
                || entry.MaterialSwatch is not null
                || entry.StoreThumbnailUrl is not null
                || entry.AssetThumbnailStatus is SceneCandidateMediaStatus.Pending)
            {
                media[SceneSlotViewBuilder.Ref(slot.Id, candidate.Id)] = entry;
            }
        }

        return media;
    }

    private static (string? Url, string Status) DescribeAsset(
        SceneAssetRef asset,
        IReadOnlyDictionary<int, ModelVersion> versions,
        IReadOnlyDictionary<int, Sprite> sprites,
        IReadOnlyDictionary<int, EnvironmentMap> environmentMaps)
    {
        switch (asset.AssetType)
        {
            case SceneAssetTypes.Model:
                if (asset.VersionId is not { } versionId || !versions.TryGetValue(versionId, out var version))
                {
                    return (null, SceneCandidateMediaStatus.Unknown);
                }

                // Pinned to the candidate's own version, not the model's active one: choosing
                // this candidate places THAT version, and a card showing a different one
                // would be arguing for an asset the user is not about to get.
                var thumbnail = version.Thumbnail;
                if (thumbnail?.Status != ThumbnailStatus.Ready)
                {
                    return (null, thumbnail is null
                        ? SceneCandidateMediaStatus.None
                        : SceneCandidateMediaStatus.Pending);
                }

                return (
                    $"/model-versions/{version.Id}/thumbnail/file?t={thumbnail.UpdatedAt:yyyyMMddHHmmss}",
                    SceneCandidateMediaStatus.Ready);

            case SceneAssetTypes.Sprite:
                return sprites.TryGetValue(asset.AssetId, out var sprite)
                    ? ($"/files/{sprite.FileId}/preview?channel=rgb", SceneCandidateMediaStatus.Ready)
                    : (null, SceneCandidateMediaStatus.Unknown);

            case SceneAssetTypes.EnvironmentMap:
                return environmentMaps.TryGetValue(asset.AssetId, out var environmentMap)
                    ? ($"/environment-maps/{environmentMap.Id}/preview?v={environmentMap.UpdatedAt.Ticks}",
                       SceneCandidateMediaStatus.Ready)
                    : (null, SceneCandidateMediaStatus.Unknown);

            default:
                return (null, SceneCandidateMediaStatus.Unknown);
        }
    }

    /// <summary>
    /// The colour goes through <see cref="MaterialParameters.ToHex"/> rather than being
    /// formatted here: the components are stored linear, and a straight float-to-byte
    /// conversion would hand the card a visibly different colour from the one the user
    /// picked. One conversion, in the type that owns the encoding.
    /// </summary>
    private static SceneMaterialSwatch Swatch(MaterialParameters parameters) => new(
        parameters.ToHex(),
        parameters.Roughness,
        parameters.Metallic,
        parameters.BaseColorA);

    private static List<int> Distinct(IEnumerable<int?> ids) =>
        ids.Where(id => id is > 0).Select(id => id!.Value).Distinct().ToList();
}
