using Domain.Models;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>Identity and size of a scene, without its document - what a list page shows.</summary>
/// <param name="Stage">
/// How far the scene has been taken, from <see cref="SceneStages"/>, or null when it is not
/// being authored in stages. Lifted out of the document so listing scenes, and the editor's
/// header, can show it without parsing one.
/// </param>
public sealed record SceneSummary(
    int Id,
    string Name,
    string? Description,
    int SchemaVersion,
    int Revision,
    int NodeCount,
    int LightCount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string? Stage = null);

/// <summary>
/// One node with the spatial truth an agent needs to reason about it without a viewport:
/// where it actually sits in the world, how big the source asset is, and where its origin
/// is relative to those bounds.
/// </summary>
/// <param name="Footprint">World-space AABB after transform, or null when the asset has no derived bounds.</param>
/// <param name="SourceDimensions">The asset's own bounds before transform, in metres.</param>
/// <param name="GroundOffset">How far the node would move on Y to rest on y=0; 0 means it already does.</param>
/// <param name="OriginInBounds">
/// The measured origin as a 0..1 fraction of the asset's own bounds per axis - what
/// <paramref name="OriginConvention"/> is a three-way label for. Sent because the editor
/// draws its selection box from it: the outline and the overlap check have to describe the
/// same box, and they only do that while both read the same number.
/// </param>
/// <param name="GroundSnap">Whether this node is being kept resting on y=0.</param>
/// <param name="Suspended">Whether this node is declared to hang with nothing under it - the third answer, beside ground and anchor, to "what holds it up".</param>
/// <param name="FaceToward">The world point this node is being kept facing, if any.</param>
/// <param name="FrontAxis">The front axis that facing is measured from - the default when the node never declared one.</param>
/// <param name="Anchor">The node this one rests on, and the offset it rests at.</param>
public sealed record SceneNodeView(
    string NodeId,
    string? Name,
    string? SlotId,
    SceneAssetRef? Asset,
    ScenePrimitive? Primitive,
    SceneTransform Transform,
    SceneMaterialBinding? Material,
    bool Visible,
    Aabb? Footprint,
    Vec3? SourceDimensions,
    string? OriginConvention,
    double? GridSize,
    double? GroundOffset,
    Vec3? OriginInBounds,
    bool GroundSnap = false,
    Vec3? FaceToward = null,
    string? FrontAxis = null,
    SceneAnchor? Anchor = null,
    bool Suspended = false,
    /// <summary>Per-slot bindings layered over <see cref="Material"/>. Empty when the node is dressed as a whole.</summary>
    IReadOnlyList<SceneMaterialBinding>? MaterialSlots = null);

/// <summary>
/// A scene, its document, and everything derived from the two.
///
/// Overlaps and scale warnings ride along with every read and every write rather than
/// living behind a separate "validate" call: an agent that has to ask a second question to
/// find out its last placement was wrong mostly does not ask.
/// </summary>
public sealed record SceneView(
    SceneSummary Scene,
    SceneDocument Document,
    IReadOnlyList<SceneNodeView> Nodes,
    IReadOnlyList<SceneOverlap> Overlaps,
    IReadOnlyList<SceneScaleWarning> ScaleWarnings);

/// <summary>Builds the read models above from a scene plus resolved asset facts.</summary>
public static class SceneViewBuilder
{
    public static SceneSummary Summarize(Scene scene, SceneDocument document) => new(
        scene.Id,
        scene.Name,
        scene.Description,
        scene.SchemaVersion,
        scene.Revision,
        document.Nodes.Count,
        document.Lights.Count,
        scene.CreatedAt,
        scene.UpdatedAt,
        document.Stage);

    public static SceneView Build(
        Scene scene,
        SceneDocument document,
        IReadOnlyDictionary<string, SceneAssetFacts> facts) => new(
            Summarize(scene, document),
            document,
            document.Nodes.Select(node => Describe(node, facts)).ToList(),
            SceneSpatial.FindOverlaps(document.Nodes, facts),
            SceneSpatial.FindScaleWarnings(document.Nodes, facts));

    public static SceneNodeView Describe(SceneNode node, IReadOnlyDictionary<string, SceneAssetFacts> facts)
    {
        var nodeFacts = node.Asset is not null && facts.TryGetValue(SceneSpatial.FactsKey(node.Asset), out var found)
            ? found
            : null;

        var footprint = SceneSpatial.Footprint(node, nodeFacts);
        var groundedY = SceneSpatial.GroundedY(node, nodeFacts);

        return new SceneNodeView(
            node.Id,
            node.Name,
            node.SlotId,
            node.Asset,
            node.Primitive,
            node.Transform,
            node.Material,
            node.Visible,
            footprint,
            nodeFacts?.WorldDimensions,
            nodeFacts?.OriginConvention,
            nodeFacts?.GridSize,
            groundedY is { } y ? y - node.Transform.Position.Y : null,
            nodeFacts?.OriginInBounds,
            node.GroundSnap ?? false,
            node.FaceToward,
            // Reported as the axis facing is actually measured from, so a caller reading a
            // node back is told the assumption rather than left to infer it from a null.
            node.FrontAxis ?? SceneFrontAxes.Default,
            node.Anchor,
            node.Suspended ?? false,
            node.MaterialSlots);
    }

    /// <summary>
    /// The validation findings that name the nodes a write just touched.
    ///
    /// Rides on the write response for the same reason overlaps do: an agent that has to ask
    /// a second question to find out its last placement was wrong mostly does not ask. This is
    /// what catches "the rug you just placed is a twelve-object test scene with two lights in
    /// it" at the moment it happens rather than at the end of the build.
    ///
    /// Scene-wide findings (no lights, no key light) carry no node ids and are deliberately
    /// dropped here - they are true before and after the write, and repeating them on every
    /// placement is how a caller learns to skim the response. <c>validate_scene</c> is where
    /// they are reported.
    /// </summary>
    public static IReadOnlyList<SceneFinding> FindingsFor(
        SceneDocument document,
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        IReadOnlyDictionary<string, SceneAssetProfile> profiles,
        IReadOnlyCollection<string> nodeIds)
    {
        if (nodeIds.Count == 0)
        {
            return Array.Empty<SceneFinding>();
        }

        return SceneValidator.Validate(document, facts, profiles).Findings
            .Where(finding => finding.NodeIds.Any(nodeIds.Contains))
            .ToList();
    }

    /// <summary>Every distinct asset reference a document makes, including its environment map.</summary>
    public static IReadOnlyList<SceneAssetRef> ReferencedAssets(SceneDocument document)
    {
        var refs = document.Nodes
            .Where(n => n.Asset is not null)
            .Select(n => n.Asset!)
            .ToList();

        if (document.Environment?.EnvironmentMap is { } map)
        {
            refs.Add(map);
        }

        return refs;
    }
}
