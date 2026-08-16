using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Places several copies of one asset evenly along a line, in a single scene write.
///
/// A street is mostly repetition, and repetition an agent computes one position at a time is
/// repetition it gets subtly wrong - the spacing arithmetic has lived in
/// <see cref="SceneSpatial.DistributeAlongLine"/> since scenes shipped, tested, with nothing
/// able to call it. This is what calls it.
///
/// One write rather than N: the copies land together or not at all, the scene's revision
/// moves once instead of twenty times, and undoing "the row of lamp posts" removes the row
/// rather than leaving nineteen of them behind.
/// </summary>
/// <param name="Count">How many copies, inclusive of both endpoints.</param>
public sealed record DistributeSceneAssetsCommand(
    int SceneId,
    string AssetType,
    int AssetId,
    Vec3 Start,
    Vec3 End,
    int Count,
    int? VersionId = null,
    string? NodeIdPrefix = null,
    string? Name = null,
    string? SlotId = null,
    Vec3? RotationEuler = null,
    Vec3? Scale = null,
    bool GroundSnap = false,
    double? SnapToGrid = null,
    int? ExpectedRevision = null,
    Vec3? FaceToward = null,
    string? FrontAxis = null) : ICommand<SceneDistributionResponse>;

/// <summary>The placed row, plus what is now wrong with the scene because of it.</summary>
public sealed record SceneDistributionResponse(
    SceneSummary Scene,
    IReadOnlyList<SceneNodeView> Nodes,
    IReadOnlyList<SceneOverlap> Overlaps,
    IReadOnlyList<SceneScaleWarning> ScaleWarnings);

internal sealed class DistributeSceneAssetsCommandHandler
    : ICommandHandler<DistributeSceneAssetsCommand, SceneDistributionResponse>
{
    /// <summary>
    /// Cap on one call. High enough for any hand-authored row, low enough that a bad
    /// argument ("space these 100000 apart") cannot write a document nothing can open.
    /// </summary>
    private const int MaxCopies = 500;

    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;

    public DistributeSceneAssetsCommandHandler(ISceneWriter writer, ISceneAssetFacts facts)
    {
        _writer = writer;
        _facts = facts;
    }

    public async Task<Result<SceneDistributionResponse>> Handle(
        DistributeSceneAssetsCommand command,
        CancellationToken cancellationToken)
    {
        if (command.Count <= 0)
        {
            return Result.Failure<SceneDistributionResponse>(new Error(
                "Scene.InvalidCount", "count must be at least 1."));
        }

        if (command.Count > MaxCopies)
        {
            return Result.Failure<SceneDistributionResponse>(new Error(
                "Scene.TooManyCopies",
                $"count is {command.Count}; at most {MaxCopies} copies can be placed in one call. Split the run into several calls."));
        }

        if (!command.Start.IsFinite || !command.End.IsFinite)
        {
            return Result.Failure<SceneDistributionResponse>(new Error(
                "Scene.InvalidVector", "start and end must be finite [x,y,z] positions."));
        }

        var frontAxis = PlaceSceneAssetCommandHandler.ReadFrontAxis(command.FrontAxis);
        if (frontAxis.IsFailure)
        {
            return Result.Failure<SceneDistributionResponse>(frontAxis.Error);
        }

        var assetRef = new SceneAssetRef(command.AssetType, command.AssetId, command.VersionId);

        // Resolved up front, exactly as a single placement does: grid snapping needs the
        // asset's own derived grid, and the mutation itself stays synchronous.
        var assetFacts = await _facts.ResolveAsync([assetRef], cancellationToken);
        assetFacts.TryGetValue(SceneSpatial.FactsKey(assetRef), out var facts);

        var positions = SceneSpatial.DistributeAlongLine(command.Start, command.End, command.Count);
        var placedNodeIds = new List<string>(positions.Count);

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var taken = document.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
                var prefix = command.NodeIdPrefix ?? $"{command.AssetType.ToLowerInvariant()}-{command.AssetId}";
                var nodes = document.Nodes.ToList();

                placedNodeIds.Clear();

                foreach (var position in positions)
                {
                    var nodeId = NextNodeId(taken, prefix);

                    var node = new SceneNode(
                        nodeId,
                        new SceneTransform(position, command.RotationEuler ?? Vec3.Zero, command.Scale ?? Vec3.One),
                        Asset: assetRef,
                        Name: command.Name,
                        SlotId: command.SlotId,
                        GroundSnap: command.GroundSnap ? true : null,
                        FrontAxis: frontAxis.Value,
                        // Each copy faces the point from where it stands, so a row of chairs
                        // around a table fans out instead of all pointing the same way.
                        FaceToward: command.FaceToward);

                    nodes.Add(PlaceSceneAssetCommandHandler.ApplyGridSnap(node, facts, command.SnapToGrid));
                    placedNodeIds.Add(nodeId);
                }

                return Result.Success(document with { Nodes = nodes });
            },
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<SceneDistributionResponse>(result.Error);
        }

        var view = result.Value.View;
        var placed = placedNodeIds.ToHashSet(StringComparer.Ordinal);

        return Result.Success(new SceneDistributionResponse(
            view.Scene,
            view.Nodes.Where(n => placed.Contains(n.NodeId)).ToList(),
            view.Overlaps.Where(o => placed.Contains(o.NodeIdA) || placed.Contains(o.NodeIdB)).ToList(),
            view.ScaleWarnings.Where(w => placed.Contains(w.NodeId)).ToList()));
    }

    /// <summary>Readable and collision-free, matching what a single placement generates.</summary>
    private static string NextNodeId(HashSet<string> taken, string prefix)
    {
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
