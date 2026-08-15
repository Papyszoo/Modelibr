using System.Text.Json;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>
/// Resolves the spatial facts a scene's nodes need: how big each referenced asset is and
/// where its origin sits inside those bounds.
/// </summary>
public interface ISceneAssetFacts
{
    /// <summary>
    /// Facts for every distinct asset reference in <paramref name="assets"/>, keyed by
    /// <see cref="SceneSpatial.FactsKey"/>. References that resolve to nothing are simply
    /// absent - the caller treats a missing entry as "bounds unknown", which is what makes
    /// the overlap and scale checks skip rather than guess.
    /// </summary>
    Task<IReadOnlyDictionary<string, SceneAssetFacts>> ResolveAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Reads bounds off the flat per-version projection and the origin convention off the
/// derived layer.
///
/// Bounds come from <c>ModelVersion.BoundingBox{X,Y,Z}</c> rather than the raw extraction
/// payload because the import already flattens them there, and reading the pinned version's
/// row is what makes a version-pinned node get <i>that</i> version's size. Origin
/// convention comes from the derivation payload, which is where the derive step classifies
/// it (<c>centered</c> / <c>bottom-center</c> / <c>corner</c>).
/// </summary>
internal sealed class SceneAssetFactsProvider : ISceneAssetFacts
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IAssetDerivationRepository _derivationRepository;

    public SceneAssetFactsProvider(
        IModelVersionRepository modelVersionRepository,
        IAssetDerivationRepository derivationRepository)
    {
        _modelVersionRepository = modelVersionRepository;
        _derivationRepository = derivationRepository;
    }

    public async Task<IReadOnlyDictionary<string, SceneAssetFacts>> ResolveAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default)
    {
        var facts = new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);

        // Distinct first: a street with forty copies of one lamp post is one lookup, not forty.
        foreach (var asset in assets.DistinctBy(SceneSpatial.FactsKey))
        {
            var key = SceneSpatial.FactsKey(asset);
            if (facts.ContainsKey(key))
            {
                continue;
            }

            var resolved = await ResolveOneAsync(asset, cancellationToken);
            if (resolved is not null)
            {
                facts[key] = resolved;
            }
        }

        return facts;
    }

    private async Task<SceneAssetFacts?> ResolveOneAsync(SceneAssetRef asset, CancellationToken cancellationToken)
    {
        Vec3? dimensions = null;

        if (asset.AssetType == SceneAssetTypes.Model && asset.VersionId is { } versionId)
        {
            var version = await _modelVersionRepository.GetByIdAsync(versionId, cancellationToken);

            // A version belonging to a different model is a mismatched reference, not a
            // near miss: answering with the wrong model's bounds would place the node
            // against geometry it does not have.
            if (version is not null && version.ModelId == asset.AssetId &&
                version.BoundingBoxX is { } x && version.BoundingBoxY is { } y && version.BoundingBoxZ is { } z)
            {
                dimensions = new Vec3(x, y, z);
            }
        }

        var derivation = await _derivationRepository.GetLatestForAssetAsync(
            MapToExtractionType(asset.AssetType), asset.AssetId, cancellationToken);

        var (originConvention, gridSize) = ReadDerivedPlacement(derivation?.Payload);

        return dimensions is null && originConvention is null && gridSize is null
            ? null
            : new SceneAssetFacts(asset.AssetType, asset.AssetId, asset.VersionId, dimensions, originConvention, gridSize);
    }

    /// <summary>Scene families are named after the extraction families, so this is identity today - kept explicit so a divergence is a compile-time decision.</summary>
    private static string MapToExtractionType(string sceneAssetType) => sceneAssetType switch
    {
        SceneAssetTypes.Model => ExtractionAssetTypes.Model,
        SceneAssetTypes.Sprite => ExtractionAssetTypes.Sprite,
        SceneAssetTypes.EnvironmentMap => ExtractionAssetTypes.EnvironmentMap,
        _ => sceneAssetType,
    };

    /// <summary>
    /// Pulls the two placement signals out of the serialized <c>DerivedAsset</c>. A payload
    /// that does not parse yields nulls rather than throwing: a corrupt derivation row must
    /// degrade placement advice, not fail the user's scene edit.
    /// </summary>
    private static (string? OriginConvention, double? GridSize) ReadDerivedPlacement(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return (null, null);
        }

        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return (null, null);
            }

            string? origin = null;
            if (root.TryGetProperty(nameof(Application.Extraction.Derivation.DerivedAsset.OriginConvention), out var originElement) &&
                originElement.ValueKind == JsonValueKind.String)
            {
                origin = originElement.GetString();
            }

            double? grid = null;
            if (root.TryGetProperty(nameof(Application.Extraction.Derivation.DerivedAsset.GridSize), out var gridElement) &&
                gridElement.ValueKind == JsonValueKind.Number)
            {
                grid = gridElement.GetDouble();
            }

            return (origin, grid);
        }
        catch (JsonException)
        {
            return (null, null);
        }
    }
}
