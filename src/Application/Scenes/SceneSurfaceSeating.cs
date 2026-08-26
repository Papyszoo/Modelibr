using Application.Extraction;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Everything a write needs to seat nodes on named surfaces, read once before the mutation
/// and then consulted synchronously inside it.
///
/// It exists because the mutation is pure and synchronous - which is what lets the writer
/// validate a candidate document before it replaces the stored one - while resolving a
/// surface needs the database. So the async half happens up front, keyed by asset reference,
/// and the mutation only ever looks things up.
///
/// Resolved lazily by design: <see cref="Empty"/> is what a call that names no surface uses,
/// and it costs nothing. Surfaces need one part query per asset, so making every placement
/// pay for them would be a real cost for a feature most placements do not use.
/// </summary>
public sealed class SceneSurfaceSeating
{
    private readonly IReadOnlyDictionary<string, SceneAssetFacts> _facts;
    private readonly IReadOnlyDictionary<string, IReadOnlyList<AssetSurface>> _surfaces;

    private SceneSurfaceSeating(
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        IReadOnlyDictionary<string, IReadOnlyList<AssetSurface>> surfaces)
    {
        _facts = facts;
        _surfaces = surfaces;
    }

    /// <summary>What a write that names no surface carries. Every <see cref="Seat"/> on it fails, and none is called.</summary>
    public static SceneSurfaceSeating Empty { get; } = new(
        new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal),
        new Dictionary<string, IReadOnlyList<AssetSurface>>(StringComparer.Ordinal));

    /// <summary>
    /// Reads the scene, finds what the named anchor targets are, and resolves those assets'
    /// bounds and surfaces.
    ///
    /// <paramref name="alsoAssets"/> is for a batch: an entry may rest on a node an earlier
    /// entry creates, which is not in the stored document yet but whose asset reference is
    /// right there in the request.
    ///
    /// A target that cannot be found here is not an error yet. The document is read again
    /// inside the mutation, under the revision check, and that read is the one that decides -
    /// this one only decides what to fetch.
    /// </summary>
    public static async Task<Result<SceneSurfaceSeating>> ResolveAsync(
        ISceneWriter writer,
        ISceneAssetFacts facts,
        ISceneAssetSurfaces surfaces,
        int sceneId,
        IReadOnlyCollection<string> targetNodeIds,
        IReadOnlyCollection<SceneAssetRef> alsoAssets,
        CancellationToken cancellationToken)
    {
        var loaded = await writer.LoadAsync(sceneId, cancellationToken);
        if (loaded.IsFailure)
        {
            return Result.Failure<SceneSurfaceSeating>(loaded.Error);
        }

        var wanted = loaded.Value.Document.Nodes
            .Where(n => targetNodeIds.Contains(n.Id, StringComparer.Ordinal))
            .Select(n => n.Asset)
            .Where(a => a is not null)
            .Select(a => a!)
            .Concat(alsoAssets)
            .DistinctBy(SceneSpatial.FactsKey)
            .ToList();

        if (wanted.Count == 0)
        {
            return Result.Success(Empty);
        }

        return Result.Success(new SceneSurfaceSeating(
            await facts.ResolveAsync(wanted, cancellationToken),
            await surfaces.ResolveAsync(wanted, cancellationToken)));
    }

    /// <summary>
    /// Moves <paramref name="node"/> onto surface <paramref name="surfaceIndex"/> of the node
    /// its anchor names, or says why it cannot.
    /// </summary>
    public Result<SceneNode> Seat(
        SceneNode node,
        SceneAssetFacts? nodeFacts,
        IReadOnlyDictionary<string, SceneNode> nodesById,
        int surfaceIndex)
    {
        if (node.Anchor is not { } anchor)
        {
            return Result.Failure<SceneNode>(new Error(
                "Scene.SurfaceWithoutAnchor",
                "A surface was named without a node to rest on. Pass the node id to anchor to as well - a surface belongs to that node."));
        }

        if (!nodesById.TryGetValue(anchor.OnNodeId, out var target))
        {
            return Result.Failure<SceneNode>(new Error(
                "Scene.AnchorTargetNotFound",
                $"No node '{anchor.OnNodeId}' in this scene to rest on. In a batch, the node must be created by an EARLIER entry."));
        }

        var key = target.Asset is { } asset ? SceneSpatial.FactsKey(asset) : null;

        return ScenePlacementRules.RestOnSurface(
            node,
            nodeFacts,
            target,
            key is not null && _facts.TryGetValue(key, out var targetFacts) ? targetFacts : null,
            key is not null && _surfaces.TryGetValue(key, out var targetSurfaces) ? targetSurfaces : null,
            surfaceIndex);
    }
}
