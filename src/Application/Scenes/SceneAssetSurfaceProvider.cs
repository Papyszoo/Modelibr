using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>
/// The resting surfaces of the assets a placement is about to sit something on.
///
/// Deliberately separate from <see cref="ISceneAssetFacts"/>, which every scene read and
/// every write resolves. Surfaces need the asset's <b>part</b> rows - one query per asset,
/// and a POLYGON City prop has hundreds of them - so folding them into the facts would put
/// that cost on <c>get_scene</c>, on the overlap check and on every write, to answer a
/// question only <c>onSurface</c> asks. This is resolved on demand, for the one or two
/// assets a call actually names.
/// </summary>
public interface ISceneAssetSurfaces
{
    /// <summary>
    /// Surfaces for each distinct reference, keyed by <see cref="SceneSpatial.FactsKey"/> and
    /// in the same order <c>get_asset</c> reports them, so an index means the same thing in
    /// both. References with no derived parts are absent rather than empty - "this asset was
    /// never measured" and "this asset has no surface" are different answers, and only the
    /// second one should let a placement fall back to the box top.
    /// </summary>
    Task<IReadOnlyDictionary<string, IReadOnlyList<AssetSurface>>> ResolveAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default);
}

internal sealed class SceneAssetSurfaceProvider : ISceneAssetSurfaces
{
    private readonly IAssetDerivationRepository _derivations;
    private readonly IAssetPartRepository _parts;

    public SceneAssetSurfaceProvider(IAssetDerivationRepository derivations, IAssetPartRepository parts)
    {
        _derivations = derivations;
        _parts = parts;
    }

    public async Task<IReadOnlyDictionary<string, IReadOnlyList<AssetSurface>>> ResolveAsync(
        IEnumerable<SceneAssetRef> assets,
        CancellationToken cancellationToken = default)
    {
        var resolved = new Dictionary<string, IReadOnlyList<AssetSurface>>(StringComparer.Ordinal);

        foreach (var asset in assets.DistinctBy(SceneSpatial.FactsKey))
        {
            // A node pins its version, and the surfaces have to be that version's: reading
            // the active version's parts for a node pinned to an older one would rest the
            // vase at a height the scene's own geometry never had.
            var derivation = asset.VersionId is { } versionId
                ? await _derivations.GetByKeyAsync(asset.AssetType, asset.AssetId, versionId, cancellationToken)
                : await _derivations.GetForActiveVersionAsync(asset.AssetType, asset.AssetId, cancellationToken);

            if (derivation is null)
            {
                continue;
            }

            var parts = await _parts.GetForAssetAsync(
                asset.AssetType, asset.AssetId, derivation.VersionId, cancellationToken);

            if (parts.Count == 0)
            {
                continue;
            }

            resolved[SceneSpatial.FactsKey(asset)] =
                AssetSurfaces.From(parts.Select(p => (p.PartPath, AssetPartDetail.Bounds(p.Detail))));
        }

        return resolved;
    }
}
