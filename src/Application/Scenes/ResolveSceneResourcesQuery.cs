using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Resolves the files and measured costs needed to progressively display arbitrary scene
/// references, including unsaved draft nodes and choice previews.
/// </summary>
public sealed record ResolveSceneResourcesQuery(IReadOnlyList<SceneAssetRef>? Assets)
    : IQuery<SceneResourceManifest>;

public sealed record SceneResourceManifest(IReadOnlyList<SceneResourceView> Resources);

public sealed record SceneResourceView(
    SceneAssetRef Asset,
    bool Resolved,
    SceneResourceFileView? Original,
    long? TotalSizeBytes,
    int? TriangleCount,
    int? MaterialCount,
    IReadOnlyList<SceneResourceAuxiliaryView> Auxiliaries,
    IReadOnlyList<SceneResourcePreviewView> Previews,
    string? ErrorCode,
    string? ErrorMessage);

public sealed record SceneResourceFileView(
    int FileId,
    string OriginalFileName,
    string Format,
    string MimeType,
    long SizeBytes,
    string Sha256Hash);

public sealed record SceneResourceAuxiliaryView(
    int FileId,
    string RelativePath,
    string OriginalFileName,
    long SizeBytes,
    string Sha256Hash);

/// <summary>
/// A bounded representation available for progressive display. Empty until the preview
/// derivation pipeline lands, but part of the manifest now so its addition does not require
/// another client contract rewrite.
/// </summary>
public sealed record SceneResourcePreviewView(
    string Kind,
    SceneResourceFileView File,
    int? TriangleCount,
    long ByteBudget,
    int TriangleBudget);

internal sealed class ResolveSceneResourcesQueryHandler
    : IQueryHandler<ResolveSceneResourcesQuery, SceneResourceManifest>
{
    private const int MaxAssets = 256;

    private readonly IModelVersionRepository _versions;
    private readonly IModelVersionAuxiliaryFileRepository _auxiliaries;
    private readonly ISpriteRepository _sprites;
    private readonly IEnvironmentMapRepository _environmentMaps;

    public ResolveSceneResourcesQueryHandler(
        IModelVersionRepository versions,
        IModelVersionAuxiliaryFileRepository auxiliaries,
        ISpriteRepository sprites,
        IEnvironmentMapRepository environmentMaps)
    {
        _versions = versions;
        _auxiliaries = auxiliaries;
        _sprites = sprites;
        _environmentMaps = environmentMaps;
    }

    public async Task<Result<SceneResourceManifest>> Handle(
        ResolveSceneResourcesQuery query,
        CancellationToken cancellationToken)
    {
        var assets = (query.Assets ?? [])
            .DistinctBy(SceneSpatial.FactsKey)
            .ToList();

        if (assets.Count > MaxAssets)
        {
            return Result.Failure<SceneResourceManifest>(new Error(
                "SceneResources.TooManyAssets",
                $"A resource manifest accepts at most {MaxAssets} distinct assets."));
        }

        var modelVersionIds = assets
            .Where(asset => asset.AssetType == SceneAssetTypes.Model && asset.VersionId is > 0)
            .Select(asset => asset.VersionId!.Value)
            .Distinct()
            .ToList();
        var spriteIds = assets
            .Where(asset => asset.AssetType == SceneAssetTypes.Sprite && asset.VersionId is null && asset.AssetId > 0)
            .Select(asset => asset.AssetId)
            .Distinct()
            .ToList();
        var environmentMapIds = assets
            .Where(asset => asset.AssetType == SceneAssetTypes.EnvironmentMap && asset.VersionId is null && asset.AssetId > 0)
            .Select(asset => asset.AssetId)
            .Distinct()
            .ToList();

        // These repositories share one scoped EF DbContext. Keep the batch reads sequential;
        // Task.WhenAll would fail under load with concurrent operations on one context.
        var versions = modelVersionIds.Count == 0
            ? []
            : await _versions.GetWithFilesByIdsAsync(modelVersionIds, cancellationToken);
        var versionIdsThatResolve = versions
            .Select(version => version.Id)
            .ToList();
        var auxiliaries = versionIdsThatResolve.Count == 0
            ? []
            : await _auxiliaries.GetForVersionsAsync(versionIdsThatResolve, cancellationToken);
        var sprites = spriteIds.Count == 0
            ? []
            : await _sprites.GetByIdsAsync(spriteIds, cancellationToken);
        var environmentMaps = environmentMapIds.Count == 0
            ? []
            : await _environmentMaps.GetByIdsAsync(environmentMapIds, cancellationToken);

        var versionsById = versions.ToDictionary(version => version.Id);
        var auxiliariesByVersion = auxiliaries
            .GroupBy(auxiliary => auxiliary.ModelVersionId)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<ModelVersionAuxiliaryFile>)group.ToList());
        var spritesById = sprites.ToDictionary(sprite => sprite.Id);
        var environmentMapsById = environmentMaps.ToDictionary(map => map.Id);

        var resources = assets
            .Select(asset => ResolveOne(
                asset,
                versionsById,
                auxiliariesByVersion,
                spritesById,
                environmentMapsById))
            .ToList();

        return Result.Success(new SceneResourceManifest(resources));
    }

    private static SceneResourceView ResolveOne(
        SceneAssetRef asset,
        IReadOnlyDictionary<int, ModelVersion> versions,
        IReadOnlyDictionary<int, IReadOnlyList<ModelVersionAuxiliaryFile>> auxiliaries,
        IReadOnlyDictionary<int, Sprite> sprites,
        IReadOnlyDictionary<int, EnvironmentMap> environmentMaps)
    {
        if (asset.AssetId <= 0)
        {
            return Failure(asset, "SceneResources.InvalidAssetId", "Asset id must be greater than 0.");
        }

        if (!SceneAssetTypes.IsPlaceable(asset.AssetType))
        {
            return Failure(
                asset,
                "SceneResources.UnsupportedAssetType",
                $"'{asset.AssetType}' is not a placeable scene asset family.");
        }

        return asset.AssetType switch
        {
            SceneAssetTypes.Model => ResolveModel(asset, versions, auxiliaries),
            SceneAssetTypes.Sprite => ResolveSprite(asset, sprites),
            SceneAssetTypes.EnvironmentMap => ResolveEnvironmentMap(asset, environmentMaps),
            _ => Failure(asset, "SceneResources.UnsupportedAssetType", $"'{asset.AssetType}' is not supported."),
        };
    }

    private static SceneResourceView ResolveModel(
        SceneAssetRef asset,
        IReadOnlyDictionary<int, ModelVersion> versions,
        IReadOnlyDictionary<int, IReadOnlyList<ModelVersionAuxiliaryFile>> auxiliaries)
    {
        if (asset.VersionId is not { } versionId)
        {
            return Failure(
                asset,
                "SceneResources.ModelVersionRequired",
                "A model resource must pin a versionId.");
        }

        if (!versions.TryGetValue(versionId, out var version))
        {
            return Failure(
                asset,
                "SceneResources.ModelVersionNotFound",
                $"There is no model version {versionId}.");
        }

        if (version.ModelId != asset.AssetId)
        {
            return Failure(
                asset,
                "SceneResources.ModelVersionMismatch",
                $"Model version {versionId} belongs to model {version.ModelId}, not model {asset.AssetId}.");
        }

        var file = version.Files
            .OrderBy(candidate => candidate.Id)
            .FirstOrDefault(candidate => candidate.FileType.IsRenderable)
            ?? version.Files.OrderBy(candidate => candidate.Id).FirstOrDefault();
        if (file is null)
        {
            return Failure(
                asset,
                "SceneResources.RenderableFileMissing",
                $"Model {asset.AssetId} version {versionId} has no renderable file.");
        }

        var auxiliaryViews = auxiliaries.TryGetValue(versionId, out var versionAuxiliaries)
            ? versionAuxiliaries.Select(ToAuxiliaryView).ToList()
            : [];

        return Success(
            asset,
            file,
            version.TriangleCount,
            version.MaterialCount,
            auxiliaryViews);
    }

    private static SceneResourceView ResolveSprite(
        SceneAssetRef asset,
        IReadOnlyDictionary<int, Sprite> sprites)
    {
        if (asset.VersionId is not null)
        {
            return Failure(
                asset,
                "SceneResources.UnversionedAsset",
                "Sprite resources must not pin a versionId.");
        }

        return sprites.TryGetValue(asset.AssetId, out var sprite)
            ? Success(asset, sprite.File)
            : Failure(
                asset,
                "SceneResources.SpriteNotFound",
                $"There is no sprite with id {asset.AssetId}.");
    }

    private static SceneResourceView ResolveEnvironmentMap(
        SceneAssetRef asset,
        IReadOnlyDictionary<int, EnvironmentMap> environmentMaps)
    {
        if (asset.VersionId is not null)
        {
            return Failure(
                asset,
                "SceneResources.UnversionedAsset",
                "EnvironmentMap resources must not pin a versionId.");
        }

        if (!environmentMaps.TryGetValue(asset.AssetId, out var environmentMap))
        {
            return Failure(
                asset,
                "SceneResources.EnvironmentMapNotFound",
                $"There is no environment map with id {asset.AssetId}.");
        }

        var variant = environmentMap.GetPreviewVariant()
            ?? environmentMap.Variants.FirstOrDefault(candidate => !candidate.IsDeleted);
        var file = variant?.GetPreviewFile();
        return file is not null
            ? Success(asset, file)
            : Failure(
                asset,
                "SceneResources.RenderableFileMissing",
                $"Environment map {asset.AssetId} has no preview file.");
    }

    private static SceneResourceView Success(
        SceneAssetRef asset,
        Domain.Models.File file,
        int? triangleCount = null,
        int? materialCount = null,
        IReadOnlyList<SceneResourceAuxiliaryView>? auxiliaries = null)
    {
        var resolvedAuxiliaries = auxiliaries ?? [];
        return new SceneResourceView(
            asset,
            Resolved: true,
            ToFileView(file),
            file.SizeBytes + resolvedAuxiliaries.Sum(auxiliary => auxiliary.SizeBytes),
            triangleCount,
            materialCount,
            resolvedAuxiliaries,
            Previews: [],
            ErrorCode: null,
            ErrorMessage: null);
    }

    private static SceneResourceView Failure(SceneAssetRef asset, string code, string message) => new(
        asset,
        Resolved: false,
        Original: null,
        TotalSizeBytes: null,
        TriangleCount: null,
        MaterialCount: null,
        Auxiliaries: [],
        Previews: [],
        ErrorCode: code,
        ErrorMessage: message);

    private static SceneResourceFileView ToFileView(Domain.Models.File file) => new(
        file.Id,
        file.OriginalFileName,
        file.FileType.Value,
        file.MimeType,
        file.SizeBytes,
        file.Sha256Hash);

    private static SceneResourceAuxiliaryView ToAuxiliaryView(ModelVersionAuxiliaryFile auxiliary) => new(
        auxiliary.FileId,
        auxiliary.RelativePath,
        auxiliary.File.OriginalFileName,
        auxiliary.File.SizeBytes,
        auxiliary.File.Sha256Hash);
}
