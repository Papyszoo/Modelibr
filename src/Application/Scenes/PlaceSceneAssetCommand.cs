using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Places a library asset into a scene.
///
/// Every spatial argument is optional and defaults to an identity transform at the origin,
/// so the minimum viable call is "put this asset in this scene" - an agent should not have
/// to compose a full transform to make its first placement.
/// </summary>
/// <param name="NodeId">Stable id for the new node. Generated from the asset reference when omitted.</param>
/// <param name="GroundSnap">Rest the asset's base on y=0 after placing, using its derived origin convention.</param>
/// <param name="SnapToGrid">Round the position onto a grid of this size, in metres. Pass 0 to use the asset's own derived grid, when it has one.</param>
public sealed record PlaceSceneAssetCommand(
    int SceneId,
    string AssetType,
    int AssetId,
    int? VersionId = null,
    string? NodeId = null,
    string? Name = null,
    string? SlotId = null,
    Vec3? Position = null,
    Vec3? RotationEuler = null,
    Vec3? Scale = null,
    bool GroundSnap = false,
    double? SnapToGrid = null,
    int? ExpectedRevision = null) : ICommand<ScenePlacementResponse>;

/// <summary>
/// The placed node plus what is now wrong with the scene because of it.
///
/// Overlaps and scale warnings are scoped to this node: a scene-wide report on every write
/// would re-report problems the agent already knows about and bury the one it just caused.
/// </summary>
public sealed record ScenePlacementResponse(
    SceneSummary Scene,
    SceneNodeView Node,
    IReadOnlyList<SceneOverlap> Overlaps,
    IReadOnlyList<SceneScaleWarning> ScaleWarnings);

internal sealed class PlaceSceneAssetCommandHandler : ICommandHandler<PlaceSceneAssetCommand, ScenePlacementResponse>
{
    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;

    public PlaceSceneAssetCommandHandler(ISceneWriter writer, ISceneAssetFacts facts)
    {
        _writer = writer;
        _facts = facts;
    }

    public async Task<Result<ScenePlacementResponse>> Handle(
        PlaceSceneAssetCommand command,
        CancellationToken cancellationToken)
    {
        var assetRef = new SceneAssetRef(command.AssetType, command.AssetId, command.VersionId);

        // Resolved up front because grounding and grid snapping need the asset's bounds and
        // origin, and the mutation itself has to stay synchronous and pure.
        var assetFacts = await _facts.ResolveAsync([assetRef], cancellationToken);
        assetFacts.TryGetValue(SceneSpatial.FactsKey(assetRef), out var facts);

        string? placedNodeId = null;

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var nodeId = command.NodeId ?? NextNodeId(document, assetRef);
                if (document.Nodes.Any(n => n.Id == nodeId))
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.DuplicateNodeId",
                        $"Scene {command.SceneId} already has a node with id '{nodeId}'. Omit nodeId to have one generated, or move the existing node instead."));
                }

                var node = new SceneNode(
                    nodeId,
                    new SceneTransform(
                        command.Position ?? Vec3.Zero,
                        command.RotationEuler ?? Vec3.Zero,
                        command.Scale ?? Vec3.One),
                    Asset: assetRef,
                    Name: command.Name,
                    SlotId: command.SlotId);

                node = ApplySnapping(node, facts, command.SnapToGrid, command.GroundSnap);

                placedNodeId = nodeId;
                return Result.Success(document with { Nodes = [.. document.Nodes, node] });
            },
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<ScenePlacementResponse>(result.Error);
        }

        var view = result.Value.View;
        var placed = view.Nodes.First(n => n.NodeId == placedNodeId);

        return Result.Success(new ScenePlacementResponse(
            view.Scene,
            placed,
            view.Overlaps.Where(o => o.NodeIdA == placedNodeId || o.NodeIdB == placedNodeId).ToList(),
            view.ScaleWarnings.Where(w => w.NodeId == placedNodeId).ToList()));
    }

    /// <summary>
    /// Grid snap before grounding, because snapping Y to a grid would otherwise lift the
    /// asset back off the floor it was just rested on.
    /// </summary>
    internal static SceneNode ApplySnapping(
        SceneNode node,
        SceneAssetFacts? facts,
        double? snapToGrid,
        bool groundSnap)
    {
        if (snapToGrid is { } grid)
        {
            // 0 means "whatever grid this asset was authored on" - a modular kit knows its
            // own module size, and an agent should not have to look it up to align a wall.
            var effective = grid > 0 ? grid : facts?.GridSize ?? 0;
            if (effective > 0)
            {
                node = node with
                {
                    Transform = node.Transform with { Position = SceneSpatial.SnapToGrid(node.Transform.Position, effective) },
                };
            }
        }

        if (groundSnap && SceneSpatial.GroundedY(node, facts) is { } y)
        {
            node = node with
            {
                Transform = node.Transform with { Position = node.Transform.Position with { Y = y } },
            };
        }

        return node;
    }

    /// <summary>
    /// A readable, collision-free id: <c>model-42-1</c>, <c>model-42-2</c>. Readable matters
    /// because these ids appear in the agent's own transcript, in undo payloads and in 05's
    /// choice UI, where a GUID tells nobody which node is the lamp post.
    /// </summary>
    private static string NextNodeId(SceneDocument document, SceneAssetRef asset)
    {
        var prefix = $"{asset.AssetType.ToLowerInvariant()}-{asset.AssetId}";
        var taken = document.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);

        for (var i = 1; ; i++)
        {
            var candidate = $"{prefix}-{i}";
            if (taken.Add(candidate))
            {
                return candidate;
            }
        }
    }
}
