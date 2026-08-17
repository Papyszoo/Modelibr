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
    string? AnchorAlign = null) : ICommand<ScenePlacementResponse>;

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
        var frontAxis = ReadFrontAxis(command.FrontAxis);
        if (frontAxis.IsFailure)
        {
            return Result.Failure<ScenePlacementResponse>(frontAxis.Error);
        }

        var anchor = ReadAnchor(command.AnchorTo, command.AnchorAlign);
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
                    SlotId: command.SlotId,
                    // Recorded rather than applied here: false and "not asked" mean the same
                    // thing for a node that is being created, and a document full of
                    // groundSnap:false is noise.
                    GroundSnap: command.GroundSnap ? true : null,
                    FrontAxis: frontAxis.Value,
                    FaceToward: command.FaceToward,
                    Anchor: anchor.Value);

                node = ApplyGridSnap(node, facts, command.SnapToGrid);

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

    /// <summary>
    /// Rounds the position onto a grid. Runs before the writer's resolution pass, which is
    /// what rests the node on the floor or on another node - snapping Y to a grid afterwards
    /// would lift the asset back off the surface it was just seated on.
    /// </summary>
    internal static SceneNode ApplyGridSnap(SceneNode node, SceneAssetFacts? facts, double? snapToGrid)
    {
        if (snapToGrid is not { } grid)
        {
            return node;
        }

        // 0 means "whatever grid this asset was authored on" - a modular kit knows its own
        // module size, and an agent should not have to look it up to align a wall.
        var effective = grid > 0 ? grid : facts?.GridSize ?? 0;
        return effective > 0
            ? node with
            {
                Transform = node.Transform with { Position = SceneSpatial.SnapToGrid(node.Transform.Position, effective) },
            }
            : node;
    }

    /// <summary>
    /// Checks a declared front axis against the vocabulary. Null passes through: no axis
    /// declared means the default, and recording "+Z" on every node would turn an assumption
    /// into something that reads like a measurement.
    /// </summary>
    internal static Result<string?> ReadFrontAxis(string? frontAxis)
    {
        if (frontAxis is null)
        {
            return Result.Success<string?>(null);
        }

        return SceneFrontAxes.Direction(frontAxis) is null
            ? Result.Failure<string?>(new Error(
                "Scene.UnknownFrontAxis",
                $"'{frontAxis}' is not a front axis. Use one of: {string.Join(", ", SceneFrontAxes.All)}."))
            : Result.Success<string?>(frontAxis);
    }

    /// <summary>
    /// Turns "on this node, aligned like that" into the anchor the document stores.
    ///
    /// The alignment only decides the offset the anchor starts with: centred is an offset of
    /// zero, and keeping means the offset is captured from wherever the node already is.
    /// After that the offset is the whole truth, which is what lets a later nudge move the
    /// vase across the table without detaching it from the table.
    /// </summary>
    internal static Result<SceneAnchor?> ReadAnchor(string? anchorTo, string? align, Vec3? offset = null)
    {
        if (string.IsNullOrWhiteSpace(anchorTo))
        {
            return align is null
                ? Result.Success<SceneAnchor?>(null)
                : Result.Failure<SceneAnchor?>(new Error(
                    "Scene.AnchorTargetMissing",
                    "An alignment was given without a node to rest on. Pass the node id to anchor to."));
        }

        if (offset is not null)
        {
            return Result.Success<SceneAnchor?>(new SceneAnchor(anchorTo, offset));
        }

        var effective = align ?? SceneAnchorAlignments.Center;
        if (!SceneAnchorAlignments.All.Contains(effective, StringComparer.Ordinal))
        {
            return Result.Failure<SceneAnchor?>(new Error(
                "Scene.UnknownAnchorAlignment",
                $"'{align}' is not an alignment. Use one of: {string.Join(", ", SceneAnchorAlignments.All)}."));
        }

        // Null offset means "capture where it already is" - the resolution pass fills it in.
        return Result.Success<SceneAnchor?>(new SceneAnchor(
            anchorTo, effective == SceneAnchorAlignments.Center ? Vec3.Zero : null));
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
