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

    /// <summary>
    /// The references in <paramref name="assets"/> that name nothing in the library, with the
    /// reason each one is unusable.
    ///
    /// Separate from <see cref="ResolveAsync"/> because the two questions have different
    /// answers: "this asset has no derived bounds yet" is normal and placement proceeds
    /// without them, while "there is no such asset" is a reference that will never load. Both
    /// looked identical to a caller reading absent facts, so a typo'd id produced a scene the
    /// editor could not render and nothing anywhere said why.
    /// </summary>
    Task<IReadOnlyList<SceneAssetReferenceProblem>> FindUnresolvableAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default);
}

/// <summary>One asset reference that cannot be resolved, and why.</summary>
public sealed record SceneAssetReferenceProblem(SceneAssetRef Asset, string Reason);

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
    private readonly ISpriteRepository _spriteRepository;
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IAssetDerivationRepository _derivationRepository;

    public SceneAssetFactsProvider(
        IModelVersionRepository modelVersionRepository,
        ISpriteRepository spriteRepository,
        IEnvironmentMapRepository environmentMapRepository,
        IAssetDerivationRepository derivationRepository)
    {
        _modelVersionRepository = modelVersionRepository;
        _spriteRepository = spriteRepository;
        _environmentMapRepository = environmentMapRepository;
        _derivationRepository = derivationRepository;
    }

    public async Task<IReadOnlyList<SceneAssetReferenceProblem>> FindUnresolvableAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default)
    {
        var problems = new List<SceneAssetReferenceProblem>();

        foreach (var asset in assets.DistinctBy(SceneSpatial.FactsKey))
        {
            var reason = await UnresolvableReasonAsync(asset, cancellationToken);
            if (reason is not null)
            {
                problems.Add(new SceneAssetReferenceProblem(asset, reason));
            }
        }

        return problems;
    }

    /// <summary>Why this reference cannot be used, or null when it resolves.</summary>
    private async Task<string?> UnresolvableReasonAsync(SceneAssetRef asset, CancellationToken cancellationToken)
    {
        if (!SceneAssetTypes.IsPlaceable(asset.AssetType))
        {
            return $"'{asset.AssetType}' is not a placeable asset family. Placeable: {string.Join(", ", SceneAssetTypes.All)}.";
        }

        if (asset.AssetType == SceneAssetTypes.Model)
        {
            if (asset.VersionId is not { } versionId)
            {
                return "A Model node must pin a versionId, or it would re-point itself when the model gets a new version.";
            }

            var version = await _modelVersionRepository.GetByIdAsync(versionId, cancellationToken);
            if (version is null)
            {
                return $"There is no model version {versionId}.";
            }

            // A version of a different model is a mismatch, not a near miss: the node would
            // load geometry that belongs to something else entirely.
            return version.ModelId != asset.AssetId
                ? $"Model version {versionId} belongs to model {version.ModelId}, not model {asset.AssetId}."
                : null;
        }

        if (asset.VersionId is not null)
        {
            return $"{asset.AssetType} assets are not versioned, so this reference must not pin a versionId.";
        }

        var exists = asset.AssetType switch
        {
            SceneAssetTypes.Sprite => await _spriteRepository.GetByIdAsync(asset.AssetId, cancellationToken) is not null,
            SceneAssetTypes.EnvironmentMap =>
                await _environmentMapRepository.GetByIdAsync(asset.AssetId, cancellationToken) is not null,
            _ => true,
        };

        return exists ? null : $"There is no {asset.AssetType.ToLowerInvariant()} with id {asset.AssetId}.";
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

        // The PINNED version's derivation, not the newest one. A node pinned to version 1
        // must keep version 1's origin convention and grid: reading the latest meant
        // uploading a new version of a model silently changed how an old scene grounded and
        // snapped it - the exact re-pointing that pinning exists to prevent. Falling back to
        // the latest is only for an unpinned family or a version that was never derived,
        // where there is no version-specific answer to prefer.
        var derivation =
            (asset.VersionId is { } derivedVersionId
                ? await _derivationRepository.GetByKeyAsync(
                    MapToExtractionType(asset.AssetType), asset.AssetId, derivedVersionId, cancellationToken)
                : null)
            ?? await _derivationRepository.GetLatestForAssetAsync(
                MapToExtractionType(asset.AssetType), asset.AssetId, cancellationToken);

        var (originConvention, gridSize, originInBounds) = ReadDerivedPlacement(derivation?.Payload);

        // A derivation written before the origin was measured reports null, and null is left
        // to stand. Rebuilding the fraction from the stored per-part world boxes was tried
        // and reverted: for a library extracted before `7f0c7c77`, those boxes are the
        // post-`normalizeModel` thumbnail framing - scaled to a 2-unit view box and
        // re-centred - so the rebuild returned a centred origin for 1725 of 1762 assets and
        // silently reproduced the bug this field exists to fix. Nothing distinguishes a
        // framing box from a real one at read time (the fix did not bump the extractor
        // version), and a fraction that looks measured but is not is worse than an absent
        // one. Stale assets fall through to the convention label, exactly as before; a
        // re-extraction is what populates this properly.
        return dimensions is null && originConvention is null && gridSize is null && originInBounds is null
            ? null
            : new SceneAssetFacts(
                asset.AssetType, asset.AssetId, asset.VersionId, dimensions, originConvention, gridSize, originInBounds);
    }

    private static Vec3? ToVec3(IReadOnlyList<double>? values) =>
        values is { Count: 3 } ? new Vec3(values[0], values[1], values[2]) : null;

    /// <summary>Scene families are named after the extraction families, so this is identity today - kept explicit so a divergence is a compile-time decision.</summary>
    private static string MapToExtractionType(string sceneAssetType) => sceneAssetType switch
    {
        SceneAssetTypes.Model => ExtractionAssetTypes.Model,
        SceneAssetTypes.Sprite => ExtractionAssetTypes.Sprite,
        SceneAssetTypes.EnvironmentMap => ExtractionAssetTypes.EnvironmentMap,
        _ => sceneAssetType,
    };

    /// <summary>
    /// Pulls the placement signals out of the serialized <c>DerivedAsset</c>. A payload
    /// that does not parse yields nulls rather than throwing: a corrupt derivation row must
    /// degrade placement advice, not fail the user's scene edit.
    /// </summary>
    private static (string? OriginConvention, double? GridSize, Vec3? OriginInBounds) ReadDerivedPlacement(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return (null, null, null);
        }

        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return (null, null, null);
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

            Vec3? originInBounds = null;
            if (root.TryGetProperty(nameof(Application.Extraction.Derivation.DerivedAsset.OriginInBounds), out var fractionElement) &&
                fractionElement.ValueKind == JsonValueKind.Array)
            {
                var axes = new List<double>(3);
                foreach (var axis in fractionElement.EnumerateArray())
                {
                    if (axis.ValueKind == JsonValueKind.Number && axis.TryGetDouble(out var value))
                    {
                        axes.Add(value);
                    }
                }

                originInBounds = ToVec3(axes);
            }

            return (origin, grid, originInBounds);
        }
        catch (JsonException)
        {
            return (null, null, null);
        }
    }
}
