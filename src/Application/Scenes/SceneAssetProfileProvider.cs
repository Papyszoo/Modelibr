using System.Text.Json;
using Application.Abstractions.Repositories;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>
/// Resolves what each referenced asset <i>is</i> - part make-up, whether it carries cameras
/// and lights, and whether anything will give it a surface.
///
/// Deliberately separate from <see cref="ISceneAssetFacts"/>. Facts are read on every scene
/// write, so they stay one cheap lookup per asset; this walks the asset's whole part list and
/// is only worth paying for when someone asks "is this scene right".
/// </summary>
public interface ISceneAssetProfiles
{
    /// <summary>
    /// Profiles for every distinct reference in <paramref name="assets"/>, keyed by
    /// <see cref="SceneSpatial.FactsKey"/>. A reference with nothing extracted is absent,
    /// and an absent profile means "not looked at" rather than "nothing wrong".
    /// </summary>
    Task<IReadOnlyDictionary<string, SceneAssetProfile>> ResolveAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default);
}

internal sealed class SceneAssetProfileProvider : ISceneAssetProfiles
{
    private readonly IAssetPartRepository _parts;
    private readonly IAssetDerivationRepository _derivations;
    private readonly IModelVersionRepository _modelVersions;

    public SceneAssetProfileProvider(
        IAssetPartRepository parts,
        IAssetDerivationRepository derivations,
        IModelVersionRepository modelVersions)
    {
        _parts = parts;
        _derivations = derivations;
        _modelVersions = modelVersions;
    }

    public async Task<IReadOnlyDictionary<string, SceneAssetProfile>> ResolveAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default)
    {
        var profiles = new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal);

        foreach (var asset in assets.DistinctBy(SceneSpatial.FactsKey))
        {
            var key = SceneSpatial.FactsKey(asset);
            if (profiles.ContainsKey(key))
            {
                continue;
            }

            var profile = await ResolveOneAsync(asset, cancellationToken);
            if (profile is not null)
            {
                profiles[key] = profile;
            }
        }

        return profiles;
    }

    private async Task<SceneAssetProfile?> ResolveOneAsync(SceneAssetRef asset, CancellationToken cancellationToken)
    {
        // Only models have a scene graph to be wrong about. A sprite is one image and an
        // environment map is one panorama - neither can secretly be a twelve-object sample
        // scene, and neither renders grey for want of a material.
        if (asset.AssetType != SceneAssetTypes.Model)
        {
            return null;
        }

        var parts = await _parts.GetForAssetAsync(asset.AssetType, asset.AssetId, asset.VersionId, cancellationToken);

        // Parts are stored per version, so a node pinned to a version that was never
        // extracted finds none. Falling back to the asset's unversioned rows would answer a
        // question about one version with another version's contents.
        var cameras = parts
            .Where(p => string.Equals(p.ObjectType, "camera", StringComparison.OrdinalIgnoreCase))
            .Select(p => p.PartPath)
            .ToList();

        var lights = parts
            .Where(p => string.Equals(p.ObjectType, "light", StringComparison.OrdinalIgnoreCase))
            .Select(p => p.PartPath)
            .ToList();

        var version = asset.VersionId is { } versionId
            ? await _modelVersions.GetByIdAsync(versionId, cancellationToken)
            : null;

        // A version belonging to another model describes something else; the reference is
        // already reported as unresolvable elsewhere, and answering with its materials here
        // would put a second, quieter wrong answer next to it.
        if (version is not null && version.ModelId != asset.AssetId)
        {
            version = null;
        }

        var derivation =
            (asset.VersionId is { } derivedVersionId
                ? await _derivations.GetByKeyAsync(
                    ExtractionAssetTypeFor(asset.AssetType), asset.AssetId, derivedVersionId, cancellationToken)
                : null)
            ?? await _derivations.GetLatestForAssetAsync(
                ExtractionAssetTypeFor(asset.AssetType), asset.AssetId, cancellationToken);

        var flags = ReadQualityFlags(derivation?.Payload);

        if (parts.Count == 0 && version is null && flags.Count == 0)
        {
            return null;
        }

        return new SceneAssetProfile(
            asset.AssetType,
            asset.AssetId,
            asset.VersionId,
            version?.Model?.Name,
            parts.Count,
            cameras,
            lights,
            version?.MaterialCount,
            version is not null && (version.DefaultTextureSetId is not null || version.TextureMappings.Count > 0),
            flags);
    }

    private static string ExtractionAssetTypeFor(string sceneAssetType) => sceneAssetType switch
    {
        SceneAssetTypes.Model => Extraction.ExtractionAssetTypes.Model,
        SceneAssetTypes.Sprite => Extraction.ExtractionAssetTypes.Sprite,
        SceneAssetTypes.EnvironmentMap => Extraction.ExtractionAssetTypes.EnvironmentMap,
        _ => sceneAssetType,
    };

    /// <summary>
    /// The derive step's asset-level quality flags. A payload that does not parse yields none,
    /// for the same reason placement does: a corrupt derivation row must degrade the advice,
    /// not fail the caller's read.
    /// </summary>
    private static IReadOnlyList<string> ReadQualityFlags(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return Array.Empty<string>();
        }

        try
        {
            using var document = JsonDocument.Parse(payload);
            if (document.RootElement.ValueKind != JsonValueKind.Object ||
                !document.RootElement.TryGetProperty(
                    nameof(Extraction.Derivation.DerivedAsset.QualityFlags), out var flags) ||
                flags.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<string>();
            }

            return flags
                .EnumerateArray()
                .Where(f => f.ValueKind == JsonValueKind.String)
                .Select(f => f.GetString()!)
                .ToList();
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }
}
