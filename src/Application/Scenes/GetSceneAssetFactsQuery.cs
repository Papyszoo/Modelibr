using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// The placement facts for one asset, before it is placed.
///
/// Exists so the editor can offer "drop it on the ground" at the moment an asset is picked.
/// Without it the editor would have to work out where the asset's feet are itself, which
/// means a second implementation of the origin-convention rules - and the moment those two
/// disagree, the box the editor draws stops being the box the overlap check uses.
/// </summary>
public sealed record GetSceneAssetFactsQuery(string AssetType, int AssetId, int? VersionId)
    : IQuery<SceneAssetFactsView>;

/// <param name="GroundedYAtOrigin">
/// The Y a node needs so this asset rests on y=0, unrotated and unscaled. Null when the
/// asset has no derived bounds - the honest answer to "where are its feet" is then
/// "unknown", and the editor places it at 0 and says so.
/// </param>
/// <param name="OriginInBounds">
/// The measured origin as a 0..1 fraction of the asset's own bounds per axis. The editor
/// draws its selection box from this, so it stays the same box the server's overlap check
/// uses; <paramref name="OriginConvention"/> is the three-way label for it, and is null
/// whenever the origin sits somewhere no label covers.
/// </param>
public sealed record SceneAssetFactsView(
    string AssetType,
    int AssetId,
    int? VersionId,
    Vec3? SourceDimensions,
    string? OriginConvention,
    double? GridSize,
    double? GroundedYAtOrigin,
    Vec3? OriginInBounds);

internal sealed class GetSceneAssetFactsQueryHandler
    : IQueryHandler<GetSceneAssetFactsQuery, SceneAssetFactsView>
{
    private readonly ISceneAssetFacts _facts;

    public GetSceneAssetFactsQueryHandler(ISceneAssetFacts facts)
    {
        _facts = facts;
    }

    public async Task<Result<SceneAssetFactsView>> Handle(
        GetSceneAssetFactsQuery query,
        CancellationToken cancellationToken)
    {
        if (!SceneAssetTypes.IsPlaceable(query.AssetType))
        {
            return Result.Failure<SceneAssetFactsView>(new Error(
                "Scene.UnplaceableAssetType",
                $"'{query.AssetType}' cannot be placed in a scene. Placeable families: {string.Join(", ", SceneAssetTypes.All)}."));
        }

        if (query.AssetId <= 0)
        {
            return Result.Failure<SceneAssetFactsView>(
                new Error("Scene.InvalidAssetId", "An asset id must be a positive integer."));
        }

        var reference = new SceneAssetRef(query.AssetType, query.AssetId, query.VersionId);
        var resolved = await _facts.ResolveAsync([reference], cancellationToken);
        resolved.TryGetValue(SceneSpatial.FactsKey(reference), out var facts);

        // A node the caller has not placed yet, at the transform placement starts from.
        // Asking the same code the write path asks is the point of computing it here.
        var probe = new SceneNode("probe", SceneTransform.Identity, Asset: reference);

        return Result.Success(new SceneAssetFactsView(
            query.AssetType,
            query.AssetId,
            query.VersionId,
            facts?.WorldDimensions,
            facts?.OriginConvention,
            facts?.GridSize,
            SceneSpatial.GroundedY(probe, facts),
            facts?.OriginInBounds));
    }
}
