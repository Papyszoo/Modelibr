using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Scenes;
using Domain.Scenes;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// Scene authoring over MCP - the tools an agent builds a scene with.
///
/// Thin pass-throughs over the same command handlers the REST endpoints and the editor use,
/// wrapped in the shared <see cref="McpWriteGuard"/> so a scene edit is claimed, attributed,
/// audited and reversible exactly like every other agent write. Every tool that overwrites
/// or removes state records a <c>PayloadBefore</c> that is the whole inverse of what it did:
/// the transform a node had, the light it replaced, the node it deleted.
///
/// Registered only with <c>MCP_WRITE_ENABLED=true</c>.
/// </summary>
[McpServerToolType]
public sealed class SceneWriteMcpTools
{
    [McpServerTool(Name = "create_scene")]
    [Description("Create a scene to compose library assets into. Starts empty unless a full document is supplied. Idempotent per idempotencyKey.")]
    public static Task<object> CreateScene(
        ICommandHandler<CreateSceneCommand, SceneView> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Scene name.")] string name,
        [Description("Unique key so a retried call does not create a second scene.")] string idempotencyKey,
        [Description("Optional description - what this scene is for.")] string? description = null,
        [Description("Optional full scene document as JSON. Omit to start empty and place assets one call at a time.")] string? documentJson = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "create-scene", "Scene", BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(new CreateSceneCommand(name, description, documentJson), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", scene = result.Value.Scene },
                        "Scene", result.Value.Scene.Id, result.Value.Scene);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "place_asset")]
    [Description("Place a library asset into a scene. Position/rotation/scale default to an identity transform at the origin. " +
                 "Set groundSnap=true to rest the asset's base on y=0 using its measured origin - do this rather than guessing a Y, " +
                 "because an asset with a centered origin placed at y=0 is buried to its middle. It STAYS set: a later move_asset that " +
                 "does not mention it keeps the asset on the floor. " +
                 "To stack instead, pass on=\"<nodeId>\" and the asset rests on that node's top face and follows it when it moves - " +
                 "no arithmetic, and nothing to recompute when the furniture underneath is swapped. " +
                 "To aim it, pass faceToward=[x,y,z] and it turns about Y to face that point, and keeps facing it. " +
                 "Returns the placed node's world footprint plus any node it now overlaps and any scale warning it triggered.")]
    public static Task<object> PlaceAsset(
        ICommandHandler<PlaceSceneAssetCommand, ScenePlacementResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Asset family: Model, Sprite or EnvironmentMap.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("Unique key so a retried call does not place the asset twice.")] string idempotencyKey,
        [Description("Version id. REQUIRED for Model - a node without one would re-point itself when the model gets a new version.")] int? versionId = null,
        [Description("Stable node id. Generated from the asset reference when omitted.")] string? nodeId = null,
        [Description("Optional human-readable node name, e.g. 'street lamp, north corner'.")] string? name = null,
        [Description("Optional slot id grouping this with the alternatives proposed for the same role.")] string? slotId = null,
        [Description("Position in metres as [x,y,z]. Defaults to the origin.")] double[]? position = null,
        [Description("Rotation in degrees as [x,y,z] (XYZ euler). Defaults to none.")] double[]? rotationEuler = null,
        [Description("Scale multiplier as [x,y,z]. Defaults to [1,1,1].")] double[]? scale = null,
        [Description("Keep the asset's base resting on y=0. Stays set until a later call passes groundSnap=false.")] bool groundSnap = false,
        [Description("Round the position onto a grid of this size in metres. Pass 0 to use the asset's own derived grid.")] double? snapToGrid = null,
        [Description("Rest this asset on the node with this id, instead of on the floor. It follows that node when it moves.")] string? on = null,
        [Description("How to sit it on that node: 'center' (default) centres it on the top face; 'keep' rests it on top of wherever the position already puts it.")] string? align = null,
        [Description("Turn the asset about Y to face this world point [x,y,z], and keep it facing there when either end moves.")] double[]? faceToward = null,
        [Description("Which local axis is this asset's front: '+Z' (assumed), '-Z', '+X' or '-X'. Nothing in the library derives this - state it when the asset ends up backwards.")] string? frontAxis = null,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "place-asset", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var vectors = ReadVectors(
                    ("position", position), ("rotationEuler", rotationEuler), ("scale", scale), ("faceToward", faceToward));
                if (vectors.Failure is { } failure)
                {
                    return failure;
                }

                var result = await handler.Handle(
                    new PlaceSceneAssetCommand(
                        sceneId, assetType, assetId, versionId, nodeId, name, slotId,
                        vectors.Values["position"], vectors.Values["rotationEuler"], vectors.Values["scale"],
                        groundSnap, snapToGrid, expectedRevision,
                        vectors.Values["faceToward"], frontAxis, on, align),
                    ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                // The inverse of a placement is removing the node it created, so the node id
                // is the whole undo record.
                return Applied(
                    new
                    {
                        status = "ok",
                        scene = result.Value.Scene,
                        node = result.Value.Node,
                        overlaps = result.Value.Overlaps,
                        scaleWarnings = result.Value.ScaleWarnings,
                        findings = result.Value.Findings,
                    },
                    "Scene", sceneId, result.Value,
                    new { removedNodeId = result.Value.Node.NodeId });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "distribute_assets")]
    [Description("Place several copies of one asset evenly along a line, from start to end inclusive, in a single write. " +
                 "Use this for anything repetitive - a row of street lamps, fence posts, a colonnade - rather than issuing one place_asset per copy: " +
                 "the spacing is computed server-side, the scene's revision moves once, and undoing it removes the whole row. " +
                 "Returns every placed node plus the overlaps and scale warnings the row caused.")]
    public static Task<object> DistributeAssets(
        ICommandHandler<DistributeSceneAssetsCommand, SceneDistributionResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Asset family: Model, Sprite or EnvironmentMap.")] string assetType,
        [Description("Asset id.")] int assetId,
        [Description("First copy's position in metres as [x,y,z].")] double[] start,
        [Description("Last copy's position in metres as [x,y,z]. Both ends get a copy.")] double[] end,
        [Description("How many copies, including both ends. 1 places a single copy at start.")] int count,
        [Description("Unique key so a retried call does not place the row twice.")] string idempotencyKey,
        [Description("Version id. REQUIRED for Model - a node without one would re-point itself when the model gets a new version.")] int? versionId = null,
        [Description("Prefix for the generated node ids, e.g. 'lamp'. Defaults to the asset reference.")] string? nodeIdPrefix = null,
        [Description("Optional name given to every copy, e.g. 'street lamp'.")] string? name = null,
        [Description("Optional slot id grouping these with the alternatives proposed for the same role.")] string? slotId = null,
        [Description("Rotation in degrees as [x,y,z], applied to every copy.")] double[]? rotationEuler = null,
        [Description("Scale multiplier as [x,y,z], applied to every copy.")] double[]? scale = null,
        [Description("Keep every copy's base resting on y=0.")] bool groundSnap = false,
        [Description("Round each position onto a grid of this size in metres. Pass 0 to use the asset's own derived grid.")] double? snapToGrid = null,
        [Description("Turn every copy to face this world point [x,y,z]. Each one faces it from where it stands, so a row fans out.")] double[]? faceToward = null,
        [Description("Which local axis is this asset's front: '+Z' (assumed), '-Z', '+X' or '-X'.")] string? frontAxis = null,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "distribute-assets", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var vectors = ReadVectors(
                    ("start", start), ("end", end), ("rotationEuler", rotationEuler), ("scale", scale),
                    ("faceToward", faceToward));
                if (vectors.Failure is { } failure)
                {
                    return failure;
                }

                var result = await handler.Handle(
                    new DistributeSceneAssetsCommand(
                        sceneId, assetType, assetId,
                        vectors.Values["start"]!.Value, vectors.Values["end"]!.Value, count,
                        versionId, nodeIdPrefix, name, slotId,
                        vectors.Values["rotationEuler"], vectors.Values["scale"],
                        groundSnap, snapToGrid, expectedRevision,
                        vectors.Values["faceToward"], frontAxis),
                    ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                // Every node this call created, so undo removes the row rather than one of it.
                return Applied(
                    new
                    {
                        status = "ok",
                        scene = result.Value.Scene,
                        nodes = result.Value.Nodes,
                        overlaps = result.Value.Overlaps,
                        scaleWarnings = result.Value.ScaleWarnings,
                        findings = result.Value.Findings,
                    },
                    "Scene", sceneId, result.Value,
                    new { removedNodeIds = result.Value.Nodes.Select(n => n.NodeId).ToArray() });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "move_asset")]
    [Description("Move, rotate or rescale one node. Omitted components are left alone - and so are the placement rules the node carries: " +
                 "a node that was ground-snapped stays on the floor, one that rests on another node stays on it, one that faces a point keeps facing it. " +
                 "Pass groundSnap=false, detachAnchor=true or an explicit rotationEuler to end each of those. " +
                 "Moving a node that others rest on moves them with it. " +
                 "Returns the node's new footprint, the transform it had before, and anything it now overlaps.")]
    public static Task<object> MoveAsset(
        ICommandHandler<MoveSceneNodeCommand, SceneNodeMoveResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Node id to move.")] string nodeId,
        [Description("Unique key so a retried call does not move the node twice.")] string idempotencyKey,
        [Description("New position in metres as [x,y,z]. Omit to leave unchanged.")] double[]? position = null,
        [Description("New rotation in degrees as [x,y,z]. Omit to leave unchanged. Setting one stops the node tracking any facing point.")] double[]? rotationEuler = null,
        [Description("New scale as [x,y,z]. Omit to leave unchanged.")] double[]? scale = null,
        [Description("Keep the node's base on y=0. Omit to leave its current setting alone; pass false to stop it snapping.")] bool? groundSnap = null,
        [Description("Round the position onto a grid of this size in metres. Pass 0 to use the asset's own derived grid.")] double? snapToGrid = null,
        [Description("Rest this node on the node with this id. Omit to leave any existing anchor alone.")] string? on = null,
        [Description("How to sit it on that node: 'center' (default) or 'keep'.")] string? align = null,
        [Description("Stop resting on another node, leaving this one where it currently is.")] bool detachAnchor = false,
        [Description("Turn the node about Y to face this world point [x,y,z], and keep it facing there.")] double[]? faceToward = null,
        [Description("Which local axis is this asset's front: '+Z' (assumed), '-Z', '+X' or '-X'.")] string? frontAxis = null,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "move-asset", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var vectors = ReadVectors(
                    ("position", position), ("rotationEuler", rotationEuler), ("scale", scale), ("faceToward", faceToward));
                if (vectors.Failure is { } failure)
                {
                    return failure;
                }

                var result = await handler.Handle(
                    new MoveSceneNodeCommand(
                        sceneId, nodeId,
                        vectors.Values["position"], vectors.Values["rotationEuler"], vectors.Values["scale"],
                        groundSnap, snapToGrid, expectedRevision,
                        vectors.Values["faceToward"], frontAxis, on, align, DetachAnchor: detachAnchor),
                    ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                // The whole prior placement, not just the transform: this write can attach,
                // detach, re-aim or un-ground the node, and an undo that put back only the
                // numbers would leave it following the wrong thing.
                return Applied(
                    new
                    {
                        status = "ok",
                        scene = result.Value.Scene,
                        node = result.Value.Node,
                        overlaps = result.Value.Overlaps,
                        scaleWarnings = result.Value.ScaleWarnings,
                        findings = result.Value.Findings,
                    },
                    "Scene", sceneId, result.Value,
                    new
                    {
                        nodeId,
                        transform = result.Value.PreviousTransform,
                        groundSnap = result.Value.PreviousGroundSnap,
                        faceToward = result.Value.PreviousFaceToward,
                        frontAxis = result.Value.PreviousFrontAxis,
                        anchor = result.Value.PreviousAnchor,
                    });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "remove_asset")]
    [Description("Remove a node from a scene. The removed node is returned in full, so the removal can be reversed.")]
    public static Task<object> RemoveAsset(
        ICommandHandler<RemoveSceneNodeCommand, SceneNodeRemovalResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Node id to remove.")] string nodeId,
        [Description("Unique key so a retried call does not remove twice.")] string idempotencyKey,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "remove-asset", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(new RemoveSceneNodeCommand(sceneId, nodeId, expectedRevision), ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", scene = result.Value.Scene, removedNode = result.Value.RemovedNode },
                        "Scene", sceneId, result.Value,
                        // The node itself, not its id: nothing else records what was there.
                        new { restoredNode = result.Value.RemovedNode });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "set_light")]
    [Description("Add, update or remove one light by id. Upsert semantics: an existing light with this id is updated in place, " +
                 "so a retried call does not stack a second sun into the scene. A new light requires a type.")]
    public static Task<object> SetLight(
        ICommandHandler<SetSceneLightCommand, SceneLightResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Light id, e.g. 'key' or 'street-lamp-3'.")] string lightId,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("Light type: ambient | directional | point | spot | hemisphere. Required when creating.")] string? type = null,
        [Description("Position in metres as [x,y,z].")] double[]? position = null,
        [Description("Intensity, ≥ 0.")] double? intensity = null,
        [Description("Hex colour, e.g. '#ffd9a0'.")] string? color = null,
        [Description("Aim point in metres as [x,y,z], for directional and spot lights.")] double[]? target = null,
        [Description("Optional human-readable name.")] string? name = null,
        [Description("Remove the light with this id instead of writing one.")] bool remove = false,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "set-light", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var vectors = ReadVectors(("position", position), ("target", target));
                if (vectors.Failure is { } failure)
                {
                    return failure;
                }

                var result = await handler.Handle(
                    new SetSceneLightCommand(
                        sceneId, lightId, type, vectors.Values["position"], intensity, color,
                        vectors.Values["target"], name, remove, expectedRevision),
                    ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", scene = result.Value.Scene, light = result.Value.Light },
                    "Scene", sceneId, result.Value,
                    // Null previousLight means this call created the light, and undoing it
                    // means deleting rather than restoring - the two cases are distinguished
                    // by presence, so the field is written either way.
                    new { lightId, light = result.Value.PreviousLight });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "apply_material")]
    [Description("Bind a texture set to one node, for this scene only - the model's own default texture set is untouched. " +
                 "Pass clear=true to remove the binding.")]
    public static Task<object> ApplyMaterial(
        ICommandHandler<ApplySceneMaterialCommand, SceneMaterialResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Node id to dress.")] string nodeId,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("Texture set id to bind.")] int? textureSetId = null,
        [Description("Optional variant name within the set.")] string? variant = null,
        [Description("Clear the binding instead of setting one.")] bool clear = false,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "apply-material", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new ApplySceneMaterialCommand(sceneId, nodeId, textureSetId, variant, clear, expectedRevision), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", scene = result.Value.Scene, node = result.Value.Node },
                        "Scene", sceneId, result.Value,
                        new { nodeId, material = result.Value.PreviousMaterial });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "update_scene_document")]
    [Description("Replace a scene's whole document. Use for bulk edits an agent would otherwise make one call at a time. " +
                 "An invalid document is rejected in full - it is never partially applied and never silently repaired.")]
    public static Task<object> UpdateSceneDocument(
        ICommandHandler<UpdateSceneDocumentCommand, SceneView> handler,
        IQueryHandler<GetSceneByIdQuery, SceneView> readHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("The full scene document as JSON.")] string documentJson,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "update-scene-document", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                // Whole-document replacement destroys whatever was there, so the previous
                // document is read first. This is the one scene write whose "before" cannot
                // be reconstructed from the operation's arguments.
                var before = await readHandler.Handle(new GetSceneByIdQuery(sceneId), ct);
                if (before.IsFailure)
                {
                    return Failed(before.Error);
                }

                var result = await handler.Handle(
                    new UpdateSceneDocumentCommand(sceneId, documentJson, expectedRevision), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new
                        {
                            status = "ok",
                            scene = result.Value.Scene,
                            overlaps = result.Value.Overlaps,
                            scaleWarnings = result.Value.ScaleWarnings,
                        },
                        "Scene", sceneId, result.Value,
                        new { document = before.Value.Document });
            },
            cancellationToken);
    }

    /// <summary>
    /// Vectors arrive as <c>double[]</c> because that is what an MCP client can express
    /// without a shared type. A wrong-length array is rejected by name rather than
    /// truncated: silently reading <c>[1,2]</c> as a position would place the node
    /// somewhere the agent never asked for and give it no way to notice.
    /// </summary>
    private static (ToolOutcome? Failure, Dictionary<string, Vec3?> Values) ReadVectors(
        params (string Name, double[]? Value)[] inputs)
    {
        var values = new Dictionary<string, Vec3?>(StringComparer.Ordinal);

        foreach (var (name, value) in inputs)
        {
            if (value is null)
            {
                values[name] = null;
                continue;
            }

            if (value.Length != 3)
            {
                return (Failed(new
                {
                    error = "InvalidVector",
                    message = $"'{name}' must be exactly three numbers [x,y,z]; got {value.Length}.",
                }), values);
            }

            values[name] = new Vec3(value[0], value[1], value[2]);
        }

        return (null, values);
    }
}
