using Domain.Models;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>Identity and size of a scene, without its document - what a list page shows.</summary>
public sealed record SceneSummary(
    int Id,
    string Name,
    string? Description,
    int SchemaVersion,
    int Revision,
    int NodeCount,
    int LightCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

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
    Vec3? OriginInBounds);

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
        scene.UpdatedAt);

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
            nodeFacts?.OriginInBounds);
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
