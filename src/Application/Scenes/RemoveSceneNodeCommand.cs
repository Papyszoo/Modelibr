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
public sealed record SceneNodeRemovalResponse(SceneSummary Scene, SceneNode RemovedNode);

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
                return Result.Success(document with
                {
                    Nodes = document.Nodes.Where((_, i) => i != index).ToList(),
                });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneNodeRemovalResponse>(result.Error)
            : Result.Success(new SceneNodeRemovalResponse(result.Value.View.Scene, removed!));
    }
}

/// <summary>
/// Puts a whole node back - the inverse of <see cref="RemoveSceneNodeCommand"/>.
///
/// Separate from placement because a removed node is not re-creatable from an asset
/// reference: it carries its own id, name, slot, material binding and visibility, and undo
/// has to restore the node that was there rather than a fresh one that resembles it.
/// </summary>
public sealed record RestoreSceneNodeCommand(int SceneId, SceneNode Node) : ICommand<SceneSummary>;

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

                // The node it rested on may itself have been removed since. Coming back
                // standing on its own is the honest outcome; refusing the undo because the
                // table is gone would strand the node in the audit log instead.
                var node = command.Node.Anchor is { } anchor &&
                    !document.Nodes.Any(n => n.Id == anchor.OnNodeId)
                        ? command.Node with { Anchor = null }
                        : command.Node;

                return Result.Success(document with { Nodes = [.. document.Nodes, node] });
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
