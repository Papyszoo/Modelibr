using Application.Extraction;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// One asset going into a scene, in the vocabulary every placement path speaks.
///
/// Extracted so <c>place_asset</c>, <c>distribute_assets</c> and <c>place_assets_batch</c>
/// share one set of spatial fields rather than three that drift apart. A batch entry is a
/// single placement, so it must not be allowed to invent its own words for grounding,
/// anchoring or facing.
/// </summary>
public sealed record ScenePlacementRequest(
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
    Vec3? FaceToward = null,
    string? FrontAxis = null,
    string? AnchorTo = null,
    string? AnchorAlign = null,
    bool Suspended = false,
    int? OnSurface = null)
{
    public SceneAssetRef Reference => new(AssetType, AssetId, VersionId);
}

/// <summary>
/// The placement vocabulary itself: how a declared front axis, an anchor, a grid and a node
/// id are read, and how the node that carries them is built.
///
/// These used to live on <see cref="PlaceSceneAssetCommandHandler"/> and were reached into
/// from the other handlers, which made a single placement the de facto owner of rules that
/// three writes depend on. They are here so a fourth write cannot quietly diverge.
/// </summary>
public static class ScenePlacementRules
{
    /// <summary>
    /// Checks a declared front axis against the vocabulary. Null passes through: no axis
    /// declared means the default, and recording "+Z" on every node would turn an assumption
    /// into something that reads like a measurement.
    /// </summary>
    public static Result<string?> ReadFrontAxis(string? frontAxis)
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
    /// <param name="surfaceLabel">
    /// The <see cref="SceneAnchor.Surface"/> to record alongside an exact offset. Only undo
    /// passes it: it restores a label that was already resolved, where
    /// <see cref="RestOnSurface"/> resolves one and computes the offset from it.
    /// </param>
    public static Result<SceneAnchor?> ReadAnchor(
        string? anchorTo,
        string? align,
        Vec3? offset = null,
        int? surfaceLabel = null)
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
            return Result.Success<SceneAnchor?>(new SceneAnchor(anchorTo, offset, surfaceLabel));
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
    /// Seats an already-anchored node on one of the target's <b>resting surfaces</b> instead
    /// of on its whole-asset box top.
    ///
    /// The surface is read once, here, and turned into an ordinary anchor offset. Nothing
    /// downstream learns a new concept: the node follows the target when it moves, undo
    /// restores an offset, and the editor drags it the same way it drags anything else. The
    /// index is kept on the anchor as a label only - see <see cref="SceneAnchor.Surface"/>
    /// for why it is not re-read.
    ///
    /// The failures are deliberately distinct. "This asset was never measured into parts" is
    /// a library state the caller can fix by re-extracting; "this asset has no surface" is a
    /// fact about the asset; "there is no surface 4" is a caller mistake, and that one lists
    /// what there is, because an agent that has to call <c>get_asset</c> again to find out is
    /// an agent that will guess instead.
    /// </summary>
    public static Result<SceneNode> RestOnSurface(
        SceneNode node,
        SceneAssetFacts? nodeFacts,
        SceneNode target,
        SceneAssetFacts? targetFacts,
        IReadOnlyList<AssetSurface>? surfaces,
        int surfaceIndex)
    {
        if (node.Anchor is not { } anchor)
        {
            return Result.Failure<SceneNode>(new Error(
                "Scene.SurfaceWithoutAnchor",
                "A surface was named without a node to rest on. Pass the node id to anchor to as well - a surface belongs to that node."));
        }

        if (surfaces is null)
        {
            return Result.Failure<SceneNode>(new Error(
                "Scene.SurfacesUnknown",
                $"Node '{target.Id}' has no measured parts, so it has no surfaces to name. Re-extract the asset, or omit onSurface and rest on its top face."));
        }

        if (surfaces.Count == 0)
        {
            return Result.Failure<SceneNode>(new Error(
                "Scene.NoSurfaces",
                $"Node '{target.Id}' has no horizontal face big enough to rest anything on. Omit onSurface to rest on its top face."));
        }

        if (surfaceIndex < 0 || surfaceIndex >= surfaces.Count)
        {
            var available = string.Join(", ", surfaces.Select(s =>
                FormattableString.Invariant($"{s.Index} at {s.Height:0.###} m ({s.Area:0.###} m²)")));
            return Result.Failure<SceneNode>(new Error(
                "Scene.UnknownSurface",
                $"Node '{target.Id}' has no surface {surfaceIndex}. It has {surfaces.Count}: {available}."));
        }

        var surface = surfaces[surfaceIndex];

        if (SceneSpatial.AnchorReference(target, targetFacts) is not { } reference ||
            SceneSpatial.SurfacePoint(target, targetFacts, surface.Height, surface.Center[0], surface.Center[2])
                is not { } point)
        {
            return Result.Failure<SceneNode>(new Error(
                "Scene.AnchorBoundsUnknown",
                $"Node '{target.Id}' has no derived bounds, so a surface height cannot be turned into a position. Place it with an explicit position instead."));
        }

        // The offset the document stores is measured from the anchor's own reference point,
        // so the surface becomes the difference between the two. That keeps one meaning of
        // "offset" in the document rather than a second one that only surface anchors use.
        Vec3? offset;
        if (anchor.Offset is { } stated)
        {
            offset = new Vec3(
                stated.X + (point.X - reference.X),
                stated.Y + (point.Y - reference.Y),
                stated.Z + (point.Z - reference.Z));
        }
        else
        {
            // align:'keep' - the caller chose the X/Z itself and only wants the height. The
            // resolution pass would capture that X/Z for us, but it would capture Y=0 with
            // it, which is exactly the wrong height.
            offset = SceneSpatial.ContactPoint(node, nodeFacts) is { } contact
                ? new Vec3(contact.X - reference.X, point.Y - reference.Y, contact.Z - reference.Z)
                : null;
        }

        if (offset is not { } resolved)
        {
            return Result.Failure<SceneNode>(new Error(
                "Scene.AnchorBoundsUnknown",
                $"The asset being placed has no derived bounds, so 'keep' cannot say where it already is. Use the default alignment, or place it with an explicit position."));
        }

        return Result.Success(node with
        {
            Anchor = anchor with { Offset = resolved, Surface = surface.Index },
        });
    }

    /// <summary>
    /// Rounds the position onto a grid. Runs before the writer's resolution pass, which is
    /// what rests the node on the floor or on another node - snapping Y to a grid afterwards
    /// would lift the asset back off the surface it was just seated on.
    /// </summary>
    public static SceneNode ApplyGridSnap(SceneNode node, SceneAssetFacts? facts, double? snapToGrid)
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
    /// A readable, collision-free id: <c>model-42-1</c>, <c>model-42-2</c>. Readable matters
    /// because these ids appear in the agent's own transcript, in undo payloads and in the
    /// choice UI, where a GUID tells nobody which node is the lamp post.
    /// </summary>
    public static string NextNodeId(HashSet<string> taken, string prefix)
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

    /// <summary>The default id prefix for an asset reference.</summary>
    public static string NodeIdPrefix(SceneAssetRef asset)
        => $"{asset.AssetType.ToLowerInvariant()}-{asset.AssetId}";

    /// <summary>
    /// The node a placement produces, before the writer's resolution pass grounds, anchors
    /// or aims it.
    /// </summary>
    /// <param name="frontAxis">Already read through <see cref="ReadFrontAxis"/>.</param>
    /// <param name="anchor">Already read through <see cref="ReadAnchor"/>.</param>
    public static SceneNode BuildNode(
        ScenePlacementRequest placement,
        string nodeId,
        string? frontAxis,
        SceneAnchor? anchor,
        SceneAssetFacts? facts)
    {
        var node = new SceneNode(
            nodeId,
            new SceneTransform(
                placement.Position ?? Vec3.Zero,
                placement.RotationEuler ?? Vec3.Zero,
                placement.Scale ?? Vec3.One),
            Asset: placement.Reference,
            Name: placement.Name,
            SlotId: placement.SlotId,
            // Recorded rather than applied here: false and "not asked" mean the same thing
            // for a node that is being created, and a document full of groundSnap:false is
            // noise.
            GroundSnap: placement.GroundSnap ? true : null,
            Suspended: placement.Suspended ? true : null,
            FrontAxis: frontAxis,
            FaceToward: placement.FaceToward,
            Anchor: anchor);

        return ApplyGridSnap(node, facts, placement.SnapToGrid);
    }
}
