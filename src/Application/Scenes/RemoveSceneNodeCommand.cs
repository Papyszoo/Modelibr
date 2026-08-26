using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

public sealed record RemoveSceneNodeCommand(
    int SceneId,
    string NodeId,
    int? ExpectedRevision = null) : ICommand<SceneNodeRemovalResponse>;

/// <summary>
/// The scene after the removal, and the node that was removed.
///
/// <paramref name="RemovedNode"/> is the entire node, not just its id, because it is the
/// only record of what was there - putting it back is the inverse of this operation.
/// </summary>
/// <param name="RemovedSlot">
/// The decision this node was the subject of, when it was the subject of one. It goes with
/// the node and comes back with it - see the handler for why that is not the same call the
/// anchors take.
/// </param>
public sealed record SceneNodeRemovalResponse(
    SceneSummary Scene,
    SceneNode RemovedNode,
    SceneSlot? RemovedSlot = null);

internal sealed class RemoveSceneNodeCommandHandler : ICommandHandler<RemoveSceneNodeCommand, SceneNodeRemovalResponse>
{
    private readonly ISceneWriter _writer;

    public RemoveSceneNodeCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneNodeRemovalResponse>> Handle(
        RemoveSceneNodeCommand command,
        CancellationToken cancellationToken)
    {
        SceneNode? removed = null;
        SceneSlot? removedSlot = null;

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var index = MoveSceneNodeCommandHandler.IndexOfNode(document, command.NodeId);
                if (index < 0)
                {
                    return Result.Failure<SceneDocument>(
                        MoveSceneNodeCommandHandler.NodeNotFound(command.SceneId, command.NodeId));
                }

                // Refused rather than cascaded, and rather than quietly detaching the nodes
                // resting on this one. Both alternatives change nodes the caller did not name:
                // a cascade deletes furniture nobody asked to delete, and a silent detach
                // leaves an undo that cannot put the arrangement back.
                var dependents = document.Nodes
                    .Where(n => n.Anchor is { } anchor && anchor.OnNodeId == command.NodeId)
                    .Select(n => n.Id)
                    .ToList();

                if (dependents.Count > 0)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.NodeHasDependents",
                        $"'{command.NodeId}' cannot be removed while {string.Join(", ", dependents.Select(id => $"'{id}'"))} rest{(dependents.Count == 1 ? "s" : "")} on it. Detach or remove them first."));
                }

                removed = document.Nodes[index];

                // A slot goes with the node it decides, unlike the anchors above. The two
                // are not the same call: cascading anchors would delete other nodes nobody
                // named, while a slot is not a node at all - it is the open question about
                // this one, and a question about a place that no longer exists cannot be
                // answered. Left behind it would also invalidate the whole document, so
                // every later write to the scene would be refused for a node the user had
                // already deleted. It is returned with the node, so undo restores both.
                var slots = document.Slots;
                if (removed.SlotId is { } slotId && slots is not null)
                {
                    removedSlot = slots.FirstOrDefault(slot => string.Equals(slot.Id, slotId, StringComparison.Ordinal));
                    if (removedSlot is not null)
                    {
                        var remaining = slots.Where(slot => !ReferenceEquals(slot, removedSlot)).ToList();
                        slots = remaining.Count == 0 ? null : remaining;
                    }
                }

                return Result.Success(document with
                {
                    Nodes = document.Nodes.Where((_, i) => i != index).ToList(),
                    Slots = slots,
                });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneNodeRemovalResponse>(result.Error)
            : Result.Success(new SceneNodeRemovalResponse(result.Value.View.Scene, removed!, removedSlot));
    }
}

/// <summary>
/// Puts a whole node back - the inverse of <see cref="RemoveSceneNodeCommand"/>.
///
/// Separate from placement because a removed node is not re-creatable from an asset
/// reference: it carries its own id, name, slot, material binding and visibility, and undo
/// has to restore the node that was there rather than a fresh one that resembles it.
/// </summary>
/// <param name="Slot">
/// The decision the node was the subject of, when the removal took one with it. Restored
/// alongside, or the undo would put the lamp back and lose the question about it.
/// </param>
public sealed record RestoreSceneNodeCommand(
    int SceneId,
    SceneNode Node,
    SceneSlot? Slot = null) : ICommand<SceneSummary>;

internal sealed class RestoreSceneNodeCommandHandler : ICommandHandler<RestoreSceneNodeCommand, SceneSummary>
{
    private readonly ISceneWriter _writer;

    public RestoreSceneNodeCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneSummary>> Handle(
        RestoreSceneNodeCommand command,
        CancellationToken cancellationToken)
    {
        var result = await _writer.ApplyAsync(
            command.SceneId,
            expectedRevision: null,
            document =>
            {
                // Already back - the same undo run twice, or the user re-created it by hand.
                // Reporting success is correct: the scene is in the state the caller wants.
                if (document.Nodes.Any(n => n.Id == command.Node.Id))
                {
                    return Result.Success(document);
                }

                var slots = document.Slots?.ToList();
                if (command.Slot is { } slot &&
                    !(slots ?? []).Any(existing => string.Equals(existing.Id, slot.Id, StringComparison.Ordinal)))
                {
                    slots ??= [];
                    slots.Add(slot);
                }

                // The node it rested on may itself have been removed since. Coming back
                // standing on its own is the honest outcome; refusing the undo because the
                // table is gone would strand the node in the audit log instead.
                var node = command.Node.Anchor is { } anchor &&
                    !document.Nodes.Any(n => n.Id == anchor.OnNodeId)
                        ? command.Node with { Anchor = null }
                        : command.Node;

                return Result.Success(document with
                {
                    Nodes = [.. document.Nodes, node],
                    Slots = slots is { Count: > 0 } ? slots : document.Slots,
                });
            },
            cancellationToken,
            // Restoring recorded state, not authoring new: if the asset was recycled after
            // the node was removed, the node comes back and reads as failed-to-load, which is
            // a far better outcome than an undo that refuses to run.
            verifyNewReferences: false);

        return result.IsFailure
            ? Result.Failure<SceneSummary>(result.Error)
            : Result.Success(result.Value.View.Scene);
    }
}
