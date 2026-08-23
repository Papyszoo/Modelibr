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
/// <param name="GroundSnap">
/// Keep the asset's base resting on y=0. Recorded on the node, so a later move that does not
/// mention it does not quietly re-centre the asset on its origin.
/// </param>
/// <param name="SnapToGrid">Round the position onto a grid of this size, in metres. Pass 0 to use the asset's own derived grid, when it has one.</param>
/// <param name="FaceToward">Turn the asset to face this world point, about Y.</param>
/// <param name="FrontAxis">Which local axis is this asset's front, from <see cref="SceneFrontAxes"/>. Defaults to +Z.</param>
/// <param name="AnchorTo">Rest the asset on this node instead of on the floor.</param>
/// <param name="AnchorAlign">How to sit it there, from <see cref="SceneAnchorAlignments"/>. Defaults to centring it.</param>
/// <param name="Suspended">Declare that this node is meant to hang with nothing under it - a pendant lamp, a sign. Contradicts <paramref name="GroundSnap"/> and <paramref name="AnchorTo"/>.</param>
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
    int? ExpectedRevision = null,
    Vec3? FaceToward = null,
    string? FrontAxis = null,
    string? AnchorTo = null,
    string? AnchorAlign = null,
    bool Suspended = false) : ICommand<ScenePlacementResponse>;

/// <summary>
/// The placed node plus what is now wrong with the scene because of it.
///
/// Overlaps, scale warnings and findings are all scoped to this node: a scene-wide report on
/// every write would re-report problems the agent already knows about and bury the one it just
/// caused.
/// </summary>
/// <param name="Findings">
/// What is wrong with this placement specifically - it is resting on nothing, it is under the
/// floor, or the asset is a whole sample scene rather than the prop it was placed as. Same
/// checks <c>validate_scene</c> runs, filtered to this node.
/// </param>
public sealed record ScenePlacementResponse(
    SceneSummary Scene,
    SceneNodeView Node,
    IReadOnlyList<SceneOverlap> Overlaps,
    IReadOnlyList<SceneScaleWarning> ScaleWarnings,
    IReadOnlyList<SceneFinding> Findings);

internal sealed class PlaceSceneAssetCommandHandler : ICommandHandler<PlaceSceneAssetCommand, ScenePlacementResponse>
{
    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;
    private readonly ISceneAssetProfiles _profiles;

    public PlaceSceneAssetCommandHandler(ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles)
    {
        _writer = writer;
        _facts = facts;
        _profiles = profiles;
    }

    public async Task<Result<ScenePlacementResponse>> Handle(
        PlaceSceneAssetCommand command,
        CancellationToken cancellationToken)
    {
        var frontAxis = ScenePlacementRules.ReadFrontAxis(command.FrontAxis);
        if (frontAxis.IsFailure)
        {
            return Result.Failure<ScenePlacementResponse>(frontAxis.Error);
        }

        var anchor = ScenePlacementRules.ReadAnchor(command.AnchorTo, command.AnchorAlign);
        if (anchor.IsFailure)
        {
            return Result.Failure<ScenePlacementResponse>(anchor.Error);
        }

        var assetRef = new SceneAssetRef(command.AssetType, command.AssetId, command.VersionId);

        // Resolved up front because grid snapping needs the asset's own derived grid, and the
        // mutation itself has to stay synchronous and pure. Grounding, anchoring and facing
        // are the writer's resolution pass, which sees the whole document.
        var assetFacts = await _facts.ResolveAsync([assetRef], cancellationToken);
        assetFacts.TryGetValue(SceneSpatial.FactsKey(assetRef), out var facts);

        string? placedNodeId = null;

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var taken = document.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
                var nodeId = command.NodeId ?? ScenePlacementRules.NextNodeId(
                    taken, ScenePlacementRules.NodeIdPrefix(assetRef));

                if (command.NodeId is not null && taken.Contains(nodeId))
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.DuplicateNodeId",
                        $"Scene {command.SceneId} already has a node with id '{nodeId}'. Omit nodeId to have one generated, or move the existing node instead."));
                }

                var node = ScenePlacementRules.BuildNode(
                    new ScenePlacementRequest(
                        command.AssetType, command.AssetId, command.VersionId,
                        Name: command.Name,
                        SlotId: command.SlotId,
                        Position: command.Position,
                        RotationEuler: command.RotationEuler,
                        Scale: command.Scale,
                        GroundSnap: command.GroundSnap,
                        SnapToGrid: command.SnapToGrid,
                        FaceToward: command.FaceToward,
                        Suspended: command.Suspended),
                    nodeId,
                    frontAxis.Value,
                    anchor.Value,
                    facts);

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

        // Only this asset's profile: the findings are filtered to this node anyway, and
        // profiling every asset in the scene would make each placement cost more the longer
        // the scene gets.
        var profiles = await _profiles.ResolveAsync([assetRef], cancellationToken);

        return Result.Success(new ScenePlacementResponse(
            view.Scene,
            placed,
            view.Overlaps.Where(o => o.NodeIdA == placedNodeId || o.NodeIdB == placedNodeId).ToList(),
            view.ScaleWarnings.Where(w => w.NodeId == placedNodeId).ToList(),
            SceneViewBuilder.FindingsFor(
                result.Value.Document, result.Value.Facts, profiles, [placedNodeId!])));
    }
}
