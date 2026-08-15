using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Moves, rotates or rescales one node. Every component is optional and an omitted one is
/// left alone, so nudging a node along X does not require restating its rotation and scale.
/// </summary>
public sealed record MoveSceneNodeCommand(
    int SceneId,
    string NodeId,
    Vec3? Position = null,
    Vec3? RotationEuler = null,
    Vec3? Scale = null,
    bool GroundSnap = false,
    double? SnapToGrid = null,
    int? ExpectedRevision = null) : ICommand<SceneNodeMoveResponse>;

/// <summary>
/// The moved node, and the transform it had before.
///
/// <paramref name="PreviousTransform"/> is the whole undo record for this operation: the
/// audit log stores it as the write's "before", and reversing the write is putting it back.
/// </summary>
public sealed record SceneNodeMoveResponse(
    SceneSummary Scene,
    SceneNodeView Node,
    SceneTransform PreviousTransform,
    IReadOnlyList<SceneOverlap> Overlaps,
    IReadOnlyList<SceneScaleWarning> ScaleWarnings);

internal sealed class MoveSceneNodeCommandHandler : ICommandHandler<MoveSceneNodeCommand, SceneNodeMoveResponse>
{
    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;

    public MoveSceneNodeCommandHandler(ISceneWriter writer, ISceneAssetFacts facts)
    {
        _writer = writer;
        _facts = facts;
    }

    public async Task<Result<SceneNodeMoveResponse>> Handle(
        MoveSceneNodeCommand command,
        CancellationToken cancellationToken)
    {
        var loaded = await _writer.LoadAsync(command.SceneId, cancellationToken);
        if (loaded.IsFailure)
        {
            return Result.Failure<SceneNodeMoveResponse>(loaded.Error);
        }

        var existing = loaded.Value.Document.Nodes.FirstOrDefault(n => n.Id == command.NodeId);
        if (existing is null)
        {
            return Result.Failure<SceneNodeMoveResponse>(NodeNotFound(command.SceneId, command.NodeId));
        }

        var previousTransform = existing.Transform;

        SceneAssetFacts? facts = null;
        if (existing.Asset is { } asset)
        {
            var resolved = await _facts.ResolveAsync([asset], cancellationToken);
            resolved.TryGetValue(SceneSpatial.FactsKey(asset), out facts);
        }

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var index = IndexOfNode(document, command.NodeId);
                if (index < 0)
                {
                    return Result.Failure<SceneDocument>(NodeNotFound(command.SceneId, command.NodeId));
                }

                var node = document.Nodes[index];
                var moved = node with
                {
                    Transform = new SceneTransform(
                        command.Position ?? node.Transform.Position,
                        command.RotationEuler ?? node.Transform.RotationEuler,
                        command.Scale ?? node.Transform.Scale),
                };

                moved = PlaceSceneAssetCommandHandler.ApplySnapping(moved, facts, command.SnapToGrid, command.GroundSnap);

                var nodes = document.Nodes.ToArray();
                nodes[index] = moved;
                return Result.Success(document with { Nodes = nodes });
            },
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<SceneNodeMoveResponse>(result.Error);
        }

        var view = result.Value.View;
        var moved = view.Nodes.First(n => n.NodeId == command.NodeId);

        return Result.Success(new SceneNodeMoveResponse(
            view.Scene,
            moved,
            previousTransform,
            view.Overlaps.Where(o => o.NodeIdA == command.NodeId || o.NodeIdB == command.NodeId).ToList(),
            view.ScaleWarnings.Where(w => w.NodeId == command.NodeId).ToList()));
    }

    internal static int IndexOfNode(SceneDocument document, string nodeId)
    {
        for (var i = 0; i < document.Nodes.Count; i++)
        {
            if (document.Nodes[i].Id == nodeId)
            {
                return i;
            }
        }

        return -1;
    }

    internal static Error NodeNotFound(int sceneId, string nodeId) =>
        new("Scene.NodeNotFound", $"Scene {sceneId} has no node with id '{nodeId}'.");
}
