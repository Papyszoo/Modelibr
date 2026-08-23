using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Places a heterogeneous layout - a sofa, a table, two lamps and a shelf - in one write.
///
/// <see cref="DistributeSceneAssetsCommand"/> already covers repetition of one asset along a
/// line. What had no verb was the ordinary case: a room's worth of different assets, which an
/// agent otherwise places with one call each. Twenty calls is twenty revisions, twenty audit
/// rows, twenty chances for the user's own edit to land in the middle, and an undo that takes
/// the lamp back out and leaves the other nineteen.
///
/// This is not a loop over <see cref="PlaceSceneAssetCommand"/>. Every entry is validated
/// before anything is written, and all of them are applied through one
/// <see cref="ISceneWriter.ApplyAsync"/>, so the batch lands whole or not at all.
/// </summary>
/// <param name="Placements">
/// Applied in array order. An entry may rest on a node already in the scene or on an earlier
/// entry of the same request; naming a later one is refused rather than silently dropped.
/// </param>
public sealed record PlaceSceneAssetsBatchCommand(
    int SceneId,
    IReadOnlyList<ScenePlacementRequest> Placements,
    int? ExpectedRevision = null) : ICommand<SceneBatchPlacementResponse>;

/// <summary>
/// Everything the batch placed, plus what is now wrong because of it.
/// </summary>
/// <param name="Findings">
/// Scoped to the nodes this call created. Every finding keeps its node id, so a caller can
/// repair the two entries that went wrong without re-placing the eighteen that did not.
/// </param>
public sealed record SceneBatchPlacementResponse(
    SceneSummary Scene,
    IReadOnlyList<SceneNodeView> Nodes,
    IReadOnlyList<SceneOverlap> Overlaps,
    IReadOnlyList<SceneScaleWarning> ScaleWarnings,
    IReadOnlyList<SceneFinding> Findings);

internal sealed class PlaceSceneAssetsBatchCommandHandler
    : ICommandHandler<PlaceSceneAssetsBatchCommand, SceneBatchPlacementResponse>
{
    /// <summary>
    /// Cap on one call, matching <c>distribute_assets</c>' existing precedent. The document's
    /// own <see cref="SceneDocumentValidator.MaxNodes"/> is checked as well, because a batch
    /// that fits here and not there would be refused by the validator with a message about
    /// the document rather than about the request.
    /// </summary>
    private const int MaxPlacements = 500;

    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;
    private readonly ISceneAssetProfiles _profiles;

    public PlaceSceneAssetsBatchCommandHandler(
        ISceneWriter writer,
        ISceneAssetFacts facts,
        ISceneAssetProfiles profiles)
    {
        _writer = writer;
        _facts = facts;
        _profiles = profiles;
    }

    public async Task<Result<SceneBatchPlacementResponse>> Handle(
        PlaceSceneAssetsBatchCommand command,
        CancellationToken cancellationToken)
    {
        var placements = command.Placements ?? [];

        if (placements.Count == 0)
        {
            return Fail("Scene.EmptyBatch", "placements is empty; pass at least one placement.");
        }

        if (placements.Count > MaxPlacements)
        {
            return Fail(
                "Scene.TooManyPlacements",
                $"placements has {placements.Count} entries; at most {MaxPlacements} can be placed in one call. Split the layout into several calls.");
        }

        // Everything that can be judged without the document is judged now, so a bad entry
        // never reaches the writer. Each error names the entry it came from - "placement 7"
        // is actionable, "invalid vector" over a twenty-entry array is not.
        var prepared = new List<PreparedPlacement>(placements.Count);
        var requestedIds = new HashSet<string>(StringComparer.Ordinal);

        for (var index = 0; index < placements.Count; index++)
        {
            var placement = placements[index];
            var where = Where(index, placement.NodeId);

            if (string.IsNullOrWhiteSpace(placement.AssetType))
            {
                return Fail("Scene.InvalidPlacement", $"{where}: assetType is required.");
            }

            foreach (var (name, value) in Vectors(placement))
            {
                if (value is { } vector && !vector.IsFinite)
                {
                    return Fail("Scene.InvalidVector", $"{where}: {name} must be three finite numbers [x,y,z].");
                }
            }

            var frontAxis = ScenePlacementRules.ReadFrontAxis(placement.FrontAxis);
            if (frontAxis.IsFailure)
            {
                return Fail(frontAxis.Error.Code, $"{where}: {frontAxis.Error.Message}");
            }

            var anchor = ScenePlacementRules.ReadAnchor(placement.AnchorTo, placement.AnchorAlign);
            if (anchor.IsFailure)
            {
                return Fail(anchor.Error.Code, $"{where}: {anchor.Error.Message}");
            }

            if (placement.NodeId is { } requested && !requestedIds.Add(requested))
            {
                return Fail(
                    "Scene.DuplicateNodeId",
                    $"{where}: two placements in this batch both ask for node id '{requested}'.");
            }

            prepared.Add(new PreparedPlacement(index, placement, frontAxis.Value, anchor.Value));
        }

        // One facts read for the distinct references, not one per entry: a room of twelve
        // chairs is one asset, and resolving it twelve times is the cost this verb exists to
        // remove.
        var references = prepared
            .Select(p => p.Placement.Reference)
            .DistinctBy(SceneSpatial.FactsKey, StringComparer.Ordinal)
            .ToList();

        var facts = await _facts.ResolveAsync(references, cancellationToken);

        var placedNodeIds = new List<string>(prepared.Count);

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var remaining = SceneDocumentValidator.MaxNodes - document.Nodes.Count;
                if (prepared.Count > remaining)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.TooManyNodes",
                        $"Scene {command.SceneId} holds {document.Nodes.Count} of at most {SceneDocumentValidator.MaxNodes} nodes; this batch would add {prepared.Count}. Room for {Math.Max(remaining, 0)} more."));
                }

                var taken = document.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
                var nodes = document.Nodes.ToList();

                placedNodeIds.Clear();

                foreach (var entry in prepared)
                {
                    var where = Where(entry.Index, entry.Placement.NodeId);
                    string nodeId;

                    if (entry.Placement.NodeId is { } requested)
                    {
                        if (!taken.Add(requested))
                        {
                            return Result.Failure<SceneDocument>(new Error(
                                "Scene.DuplicateNodeId",
                                $"{where}: scene {command.SceneId} already has a node with id '{requested}'. Omit nodeId to have one generated, or move the existing node instead."));
                        }

                        nodeId = requested;
                    }
                    else
                    {
                        nodeId = ScenePlacementRules.NextNodeId(
                            taken, ScenePlacementRules.NodeIdPrefix(entry.Placement.Reference));
                    }

                    // Order is the contract: an entry may rest on something already in the
                    // scene or on something an earlier entry of this batch put there. A
                    // forward reference is refused here rather than by the document
                    // validator, because the validator can only say "unknown anchor" while
                    // this can say which entry asked for it and that reordering fixes it.
                    if (entry.Anchor is { OnNodeId: var anchorTarget } && !taken.Contains(anchorTarget))
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.AnchorNotFound",
                            $"{where}: nothing in the scene or earlier in this batch has node id '{anchorTarget}'. Place what it rests on first - entries are applied in array order."));
                    }

                    facts.TryGetValue(SceneSpatial.FactsKey(entry.Placement.Reference), out var assetFacts);

                    nodes.Add(ScenePlacementRules.BuildNode(
                        entry.Placement, nodeId, entry.FrontAxis, entry.Anchor, assetFacts));

                    placedNodeIds.Add(nodeId);
                }

                return Result.Success(document with { Nodes = nodes });
            },
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<SceneBatchPlacementResponse>(result.Error);
        }

        var view = result.Value.View;
        var placed = placedNodeIds.ToHashSet(StringComparer.Ordinal);

        var profiles = await _profiles.ResolveAsync(references, cancellationToken);

        return Result.Success(new SceneBatchPlacementResponse(
            view.Scene,
            view.Nodes.Where(n => placed.Contains(n.NodeId)).ToList(),
            view.Overlaps.Where(o => placed.Contains(o.NodeIdA) || placed.Contains(o.NodeIdB)).ToList(),
            view.ScaleWarnings.Where(w => placed.Contains(w.NodeId)).ToList(),
            SceneViewBuilder.FindingsFor(result.Value.Document, result.Value.Facts, profiles, placed)));
    }

    private static IEnumerable<(string Name, Vec3? Value)> Vectors(ScenePlacementRequest placement)
    {
        yield return ("position", placement.Position);
        yield return ("rotationEuler", placement.RotationEuler);
        yield return ("scale", placement.Scale);
        yield return ("faceToward", placement.FaceToward);
    }

    /// <summary>
    /// Names the entry an error came from. The requested node id is included when there is
    /// one, because "placement 7 (sofa)" survives the agent reordering its own array and a
    /// bare index does not.
    /// </summary>
    private static string Where(int index, string? nodeId)
        => nodeId is null ? $"placement {index}" : $"placement {index} ('{nodeId}')";

    private static Result<SceneBatchPlacementResponse> Fail(string code, string message)
        => Result.Failure<SceneBatchPlacementResponse>(new Error(code, message));

    private sealed record PreparedPlacement(
        int Index,
        ScenePlacementRequest Placement,
        string? FrontAxis,
        SceneAnchor? Anchor);
}
