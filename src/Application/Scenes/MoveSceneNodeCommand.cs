using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Moves, rotates or rescales one node. Every component is optional and an omitted one is
/// left alone, so nudging a node along X does not require restating its rotation and scale.
///
/// That rule extends to the placement rules the node carries: a move that says nothing about
/// grounding, facing or what the node rests on keeps all three. The alternative is what this
/// replaces - a move that supplied only a position silently re-centred the node on its own
/// origin and reported it as a changed footprint.
/// </summary>
/// <param name="GroundSnap">Keep the node's base on y=0. Null leaves the node's current setting alone; false stops it snapping.</param>
/// <param name="Suspended">Declare that this node is meant to hang with nothing under it. Null leaves the current setting alone; false withdraws the declaration.</param>
/// <param name="FaceToward">Turn the node to face this world point, and keep it facing there. Null leaves its current facing alone.</param>
/// <param name="FrontAxis">Which local axis is the asset's front, from <see cref="SceneFrontAxes"/>. Null leaves the node's current declaration alone.</param>
/// <param name="AnchorTo">Rest this node on that one. Null leaves any existing anchor alone.</param>
/// <param name="AnchorAlign">How to sit it there, from <see cref="SceneAnchorAlignments"/>. Defaults to centring it.</param>
/// <param name="AnchorOffset">The exact offset to anchor at, for undo. Overrides <paramref name="AnchorAlign"/>.</param>
/// <param name="DetachAnchor">Stop resting on another node, leaving this one where it currently is.</param>
/// <param name="Exact">
/// Treat the placement rules as the whole state rather than a patch, so an omitted one is
/// cleared instead of kept. Undo is the caller that needs it: partial updates make some prior
/// states - a node that faced nothing, or rested on nothing - otherwise unreachable.
/// </param>
public sealed record MoveSceneNodeCommand(
    int SceneId,
    string NodeId,
    Vec3? Position = null,
    Vec3? RotationEuler = null,
    Vec3? Scale = null,
    bool? GroundSnap = null,
    bool? Suspended = null,
    double? SnapToGrid = null,
    int? ExpectedRevision = null,
    Vec3? FaceToward = null,
    string? FrontAxis = null,
    string? AnchorTo = null,
    string? AnchorAlign = null,
    Vec3? AnchorOffset = null,
    bool DetachAnchor = false,
    bool Exact = false) : ICommand<SceneNodeMoveResponse>;

/// <summary>
/// The moved node, and the placement it had before.
///
/// The previous state is the whole undo record for this operation: the audit log stores it as
/// the write's "before", and reversing the write is putting it back. It carries the placement
/// rules as well as the transform, because a move can attach, detach, re-aim or un-ground a
/// node, and an undo that restored only the numbers would leave it attached to the wrong thing.
/// </summary>
/// <param name="Findings">
/// What is wrong with the node where this move left it - resting on nothing, under the floor,
/// tilted. Same checks <c>validate_scene</c> runs, filtered to this node.
/// </param>
public sealed record SceneNodeMoveResponse(
    SceneSummary Scene,
    SceneNodeView Node,
    SceneTransform PreviousTransform,
    IReadOnlyList<SceneOverlap> Overlaps,
    IReadOnlyList<SceneScaleWarning> ScaleWarnings,
    IReadOnlyList<SceneFinding> Findings,
    bool? PreviousGroundSnap = null,
    bool? PreviousSuspended = null,
    Vec3? PreviousFaceToward = null,
    string? PreviousFrontAxis = null,
    SceneAnchor? PreviousAnchor = null);

internal sealed class MoveSceneNodeCommandHandler : ICommandHandler<MoveSceneNodeCommand, SceneNodeMoveResponse>
{
    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;
    private readonly ISceneAssetProfiles _profiles;

    public MoveSceneNodeCommandHandler(ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles)
    {
        _writer = writer;
        _facts = facts;
        _profiles = profiles;
    }

    public async Task<Result<SceneNodeMoveResponse>> Handle(
        MoveSceneNodeCommand command,
        CancellationToken cancellationToken)
    {
        var frontAxis = PlaceSceneAssetCommandHandler.ReadFrontAxis(command.FrontAxis);
        if (frontAxis.IsFailure)
        {
            return Result.Failure<SceneNodeMoveResponse>(frontAxis.Error);
        }

        var anchor = PlaceSceneAssetCommandHandler.ReadAnchor(
            command.AnchorTo, command.AnchorAlign, command.AnchorOffset);
        if (anchor.IsFailure)
        {
            return Result.Failure<SceneNodeMoveResponse>(anchor.Error);
        }

        if (command.DetachAnchor && anchor.Value is not null)
        {
            return Result.Failure<SceneNodeMoveResponse>(new Error(
                "Scene.AnchorAmbiguous",
                "This move both attaches the node to another and detaches it. Pass one or the other."));
        }

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
        var previousGroundSnap = existing.GroundSnap;
        var previousSuspended = existing.Suspended;
        var previousFaceToward = existing.FaceToward;
        var previousFrontAxis = existing.FrontAxis;
        var previousAnchor = existing.Anchor;

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
                    GroundSnap = command.GroundSnap ?? (command.Exact ? null : node.GroundSnap),
                    Suspended = command.Suspended ?? (command.Exact ? null : node.Suspended),
                    FrontAxis = frontAxis.Value ?? (command.Exact ? null : node.FrontAxis),
                    FaceToward = FacingAfter(command, node),
                    Anchor = command.DetachAnchor
                        ? null
                        : anchor.Value ?? (command.Exact ? null : node.Anchor),
                };

                moved = PlaceSceneAssetCommandHandler.ApplyGridSnap(moved, facts, command.SnapToGrid);

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

        var profiles = moved.Asset is { } movedAsset
            ? await _profiles.ResolveAsync([movedAsset], cancellationToken)
            : new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal);

        return Result.Success(new SceneNodeMoveResponse(
            view.Scene,
            moved,
            previousTransform,
            view.Overlaps.Where(o => o.NodeIdA == command.NodeId || o.NodeIdB == command.NodeId).ToList(),
            view.ScaleWarnings.Where(w => w.NodeId == command.NodeId).ToList(),
            SceneViewBuilder.FindingsFor(
                result.Value.Document, result.Value.Facts, profiles, [command.NodeId]),
            previousGroundSnap,
            previousSuspended,
            previousFaceToward,
            previousFrontAxis,
            previousAnchor));
    }

    /// <summary>
    /// What the node should be facing after this move.
    ///
    /// A stated rotation clears a facing point: a caller who gives an angle is setting the
    /// angle, and leaving the old target in place would have the next write silently turn the
    /// node back. Undo relies on this too - it replays the previous rotation.
    /// </summary>
    private static Vec3? FacingAfter(MoveSceneNodeCommand command, SceneNode node)
    {
        if (command.FaceToward is { } target)
        {
            return target;
        }

        return command.Exact || command.RotationEuler is not null ? null : node.FaceToward;
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
