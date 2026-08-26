using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Puts a blockout box, plane, sphere, cylinder or cone into a scene.
///
/// The gap this fills is narrow and was expensive: an agent building a room had no way to
/// make a box, so it built the shell out of library assets stretched to size - and both
/// attempts were wrong in ways only a screenshot revealed. One was slatted panelling with
/// gaps between the planks; the other was asphalt-black. Walls, floors and ceilings are the
/// one part of a scene that should never require an asset search at all.
/// </summary>
/// <param name="Size">Extents in metres. Defaults to a 1 m unit.</param>
/// <param name="Color">An <c>#rrggbb</c> surface colour, or null for the neutral blockout grey.</param>
public sealed record PlaceScenePrimitiveCommand(
    int SceneId,
    string Shape,
    Vec3? Size = null,
    string? Color = null,
    string? NodeId = null,
    string? Name = null,
    Vec3? Position = null,
    Vec3? RotationEuler = null,
    Vec3? Scale = null,
    bool GroundSnap = false,
    int? ExpectedRevision = null) : ICommand<ScenePlacementResponse>;

/// <summary>
/// Emits a whole room shell - floor, four walls and optionally a ceiling - as one write.
///
/// A room is five boxes whose sizes and positions all derive from three numbers, and an
/// agent computing them one at a time gets the wall thickness offsets subtly wrong: a wall
/// centred on the room's edge is half outside it, and the floor is a metre short on two
/// sides. The arithmetic lives here for the same reason the distribution arithmetic does.
/// </summary>
/// <param name="Center">Where the room's floor centre sits. Defaults to the origin.</param>
/// <param name="WallThickness">Wall and floor thickness in metres. Defaults to 0.1.</param>
public sealed record CreateSceneRoomCommand(
    int SceneId,
    double Width,
    double Depth,
    double Height,
    Vec3? Center = null,
    double? WallThickness = null,
    bool IncludeCeiling = false,
    string? NodeIdPrefix = null,
    string? FloorColor = null,
    string? WallColor = null,
    int? ExpectedRevision = null) : ICommand<SceneDistributionResponse>;

internal sealed class PlaceScenePrimitiveCommandHandler
    : ICommandHandler<PlaceScenePrimitiveCommand, ScenePlacementResponse>
{
    private readonly ISceneWriter _writer;

    public PlaceScenePrimitiveCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<ScenePlacementResponse>> Handle(
        PlaceScenePrimitiveCommand command,
        CancellationToken cancellationToken)
    {
        if (!ScenePrimitiveShapes.All.Contains(command.Shape, StringComparer.Ordinal))
        {
            return Result.Failure<ScenePlacementResponse>(new Error(
                "Scene.UnknownPrimitiveShape",
                $"'{command.Shape}' is not a known primitive. Use one of: {string.Join(", ", ScenePrimitiveShapes.All)}."));
        }

        string? placedNodeId = null;

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var taken = document.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
                var nodeId = command.NodeId ?? ScenePlacementRules.NextNodeId(taken, command.Shape);

                if (command.NodeId is not null && taken.Contains(nodeId))
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.DuplicateNodeId",
                        $"Scene {command.SceneId} already has a node with id '{nodeId}'."));
                }

                var node = new SceneNode(
                    nodeId,
                    new SceneTransform(
                        command.Position ?? Vec3.Zero,
                        command.RotationEuler ?? Vec3.Zero,
                        command.Scale ?? Vec3.One),
                    Primitive: new ScenePrimitive(command.Shape, command.Size, command.Color),
                    Name: command.Name,
                    GroundSnap: command.GroundSnap ? true : null);

                placedNodeId = nodeId;
                return Result.Success(document with { Nodes = [.. document.Nodes, node] });
            },
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<ScenePlacementResponse>(result.Error);
        }

        var view = result.Value.View;

        // No profiles: a primitive is not a library asset, so there is nothing to measure it
        // against and no identity finding it could ever trigger.
        return Result.Success(new ScenePlacementResponse(
            view.Scene,
            view.Nodes.First(n => n.NodeId == placedNodeId),
            view.Overlaps.Where(o => o.NodeIdA == placedNodeId || o.NodeIdB == placedNodeId).ToList(),
            view.ScaleWarnings.Where(w => w.NodeId == placedNodeId).ToList(),
            SceneViewBuilder.FindingsFor(
                result.Value.Document,
                result.Value.Facts,
                new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal),
                [placedNodeId!])));
    }
}

internal sealed class CreateSceneRoomCommandHandler
    : ICommandHandler<CreateSceneRoomCommand, SceneDistributionResponse>
{
    /// <summary>Default wall and floor thickness. Thin enough not to eat the room, thick enough to read as a wall.</summary>
    private const double DefaultThickness = 0.1;

    /// <summary>
    /// The largest room this will emit, per side. Past this the numbers stop describing a
    /// room and start describing an argument the caller got wrong by three orders of
    /// magnitude - and a 100 km wall is a scene the viewport cannot draw.
    /// </summary>
    private const double MaxExtent = 1_000;

    private readonly ISceneWriter _writer;

    public CreateSceneRoomCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneDistributionResponse>> Handle(
        CreateSceneRoomCommand command,
        CancellationToken cancellationToken)
    {
        foreach (var (name, value) in new[]
                 {
                     ("width", command.Width), ("depth", command.Depth), ("height", command.Height),
                 })
        {
            if (!double.IsFinite(value) || value <= 0)
            {
                return Fail("Scene.InvalidRoom", $"{name} must be a positive number of metres.");
            }

            if (value > MaxExtent)
            {
                return Fail("Scene.InvalidRoom", $"{name} is {value} m; at most {MaxExtent} m is accepted.");
            }
        }

        var thickness = command.WallThickness ?? DefaultThickness;
        if (!double.IsFinite(thickness) || thickness <= 0 || thickness >= Math.Min(command.Width, command.Depth) / 2)
        {
            return Fail(
                "Scene.InvalidRoom",
                $"wallThickness must be positive and less than half the smaller floor dimension; got {thickness}.");
        }

        var center = command.Center ?? Vec3.Zero;
        if (!center.IsFinite)
        {
            return Fail("Scene.InvalidVector", "center must be three finite numbers [x,y,z].");
        }

        var prefix = command.NodeIdPrefix ?? "room";
        var placedNodeIds = new List<string>();

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var nodes = document.Nodes.ToList();
                var taken = document.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);

                placedNodeIds.Clear();

                foreach (var part in Parts(command, center, thickness))
                {
                    var nodeId = $"{prefix}-{part.Suffix}";
                    if (!taken.Add(nodeId))
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.DuplicateNodeId",
                            $"Scene {command.SceneId} already has a node with id '{nodeId}'. Pass a different nodeIdPrefix, or remove the room that is already there."));
                    }

                    nodes.Add(new SceneNode(
                        nodeId,
                        new SceneTransform(part.Position, Vec3.Zero, Vec3.One),
                        Primitive: new ScenePrimitive(ScenePrimitiveShapes.Box, part.Size, part.Color),
                        Name: part.Name));

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
            // The shell's own corners touch by construction, and reporting them would bury
            // the one overlap that matters - a sofa halfway through a wall - under four that
            // are correct. Only overlaps with something OUTSIDE the shell are reported.
            view.Overlaps
                .Where(o => placed.Contains(o.NodeIdA) ^ placed.Contains(o.NodeIdB))
                .ToList(),
            view.ScaleWarnings.Where(w => placed.Contains(w.NodeId)).ToList(),
            SceneViewBuilder.FindingsFor(
                result.Value.Document,
                result.Value.Facts,
                new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal),
                placed)));
    }

    /// <summary>One box of the shell: what it is called, how big it is and where it sits.</summary>
    private sealed record RoomPart(string Suffix, string Name, Vec3 Size, Vec3 Position, string? Color);

    /// <summary>
    /// The shell, derived from three numbers.
    ///
    /// Two conventions decide everything here, and both are the ones a person means by
    /// "a 5 by 4 room, 2.6 high": the <b>floor's top face is at the given Y</b>, so furniture
    /// ground-snapped to y=0 stands on the floor rather than inside it; and the walls sit
    /// <b>outside</b> the stated width and depth, so the clear internal space is exactly what
    /// was asked for rather than that minus two wall thicknesses.
    /// </summary>
    private static IEnumerable<RoomPart> Parts(
        CreateSceneRoomCommand command, Vec3 center, double thickness)
    {
        var (w, d, h) = (command.Width, command.Depth, command.Height);
        var outerW = w + (thickness * 2);
        var outerD = d + (thickness * 2);
        var floorColor = command.FloorColor;
        var wallColor = command.WallColor;

        yield return new RoomPart(
            "floor", "Room floor",
            new Vec3(outerW, thickness, outerD),
            new Vec3(center.X, center.Y - (thickness / 2), center.Z),
            floorColor);

        yield return new RoomPart(
            "wall-north", "Room wall (north, -Z)",
            new Vec3(outerW, h, thickness),
            new Vec3(center.X, center.Y + (h / 2), center.Z - (d / 2) - (thickness / 2)),
            wallColor);

        yield return new RoomPart(
            "wall-south", "Room wall (south, +Z)",
            new Vec3(outerW, h, thickness),
            new Vec3(center.X, center.Y + (h / 2), center.Z + (d / 2) + (thickness / 2)),
            wallColor);

        yield return new RoomPart(
            "wall-west", "Room wall (west, -X)",
            new Vec3(thickness, h, d),
            new Vec3(center.X - (w / 2) - (thickness / 2), center.Y + (h / 2), center.Z),
            wallColor);

        yield return new RoomPart(
            "wall-east", "Room wall (east, +X)",
            new Vec3(thickness, h, d),
            new Vec3(center.X + (w / 2) + (thickness / 2), center.Y + (h / 2), center.Z),
            wallColor);

        if (command.IncludeCeiling)
        {
            yield return new RoomPart(
                "ceiling", "Room ceiling",
                new Vec3(outerW, thickness, outerD),
                new Vec3(center.X, center.Y + h + (thickness / 2), center.Z),
                wallColor);
        }
    }

    private static Result<SceneDistributionResponse> Fail(string code, string message)
        => Result.Failure<SceneDistributionResponse>(new Error(code, message));
}
