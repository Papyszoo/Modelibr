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
                 "For something meant to hang with nothing under it - a pendant lamp, a sign - pass suspended=true, or it is reported as floating for the life of the scene. " +
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
        [Description("This node is meant to hang in mid-air with nothing under it. Cannot be combined with groundSnap or on.")] bool suspended = false,
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
                        vectors.Values["faceToward"], frontAxis, on, align, suspended),
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

    /// <summary>
    /// One entry of a batch placement. Mirrors <c>place_asset</c>'s spatial fields exactly -
    /// a batch must not grow a second vocabulary for grounding, anchoring or facing.
    /// </summary>
    public sealed record BatchPlacement(
        [property: Description("Asset family: Model, Sprite or EnvironmentMap.")] string AssetType,
        [property: Description("Asset id.")] int AssetId,
        [property: Description("Version id. REQUIRED for Model - a node without one would re-point itself when the model gets a new version.")] int? VersionId = null,
        [property: Description("Stable node id. Generated from the asset reference when omitted. Give one when a later entry needs to rest on this node.")] string? NodeId = null,
        [property: Description("Optional human-readable node name, e.g. 'reading lamp, by the sofa'.")] string? Name = null,
        [property: Description("Optional slot id grouping this with the alternatives proposed for the same role.")] string? SlotId = null,
        [property: Description("Position in metres as [x,y,z]. Defaults to the origin.")] double[]? Position = null,
        [property: Description("Rotation in degrees as [x,y,z] (XYZ euler). Defaults to none.")] double[]? RotationEuler = null,
        [property: Description("Scale multiplier as [x,y,z]. Defaults to [1,1,1].")] double[]? Scale = null,
        [property: Description("Keep this asset's base resting on y=0, using its measured origin.")] bool GroundSnap = false,
        [property: Description("Round the position onto a grid of this size in metres. Pass 0 to use the asset's own derived grid.")] double? SnapToGrid = null,
        [property: Description("Turn this asset about Y to face this world point [x,y,z].")] double[]? FaceToward = null,
        [property: Description("Which local axis is this asset's front: '+Z' (assumed), '-Z', '+X' or '-X'.")] string? FrontAxis = null,
        [property: Description("Rest this asset on the node with this id - either one already in the scene, or one an EARLIER entry of this batch created. Naming a later entry is refused.")] string? On = null,
        [property: Description("How to sit it on that node: 'center' (default) or 'keep'.")] string? Align = null,
        [property: Description("This node is meant to hang in mid-air with nothing under it. Cannot be combined with groundSnap or on.")] bool Suspended = false);

    [McpServerTool(Name = "place_assets_batch")]
    [Description("Place a whole layout of DIFFERENT assets - a sofa, a table, two lamps, a rug - in ONE write. " +
                 "Use this instead of a run of place_asset calls whenever you already know what the room contains: " +
                 "the scene's revision moves once, the user cannot edit the scene out from under you halfway through, " +
                 "and undoing it takes the whole layout back out rather than one node of it. " +
                 "Every entry speaks exactly the same placement vocabulary as place_asset, including groundSnap, on/align, faceToward and suspended. " +
                 "Entries are applied IN ARRAY ORDER, so an entry may rest on a node an earlier entry created - put the table before the vase. " +
                 "Nothing is written unless every entry is valid: an error names the entry index and the node id it asked for, so you repair that one and resend. " +
                 "For many copies of ONE asset along a line, use distribute_assets instead - it computes the spacing for you. " +
                 "Returns every placed node plus the overlaps, scale warnings and validator findings the layout caused, each keyed by node id.")]
    public static Task<object> PlaceAssetsBatch(
        ICommandHandler<PlaceSceneAssetsBatchCommand, SceneBatchPlacementResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("The placements, applied in this order.")] BatchPlacement[] placements,
        [Description("Unique key so a retried call does not place the layout twice.")] string idempotencyKey,
        [Description("Optional expected scene revision; the whole batch is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "place-assets-batch", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var requests = new List<ScenePlacementRequest>((placements ?? []).Length);

                for (var index = 0; index < (placements ?? []).Length; index++)
                {
                    var entry = placements![index];
                    var vectors = ReadVectors(
                        ($"placements[{index}].position", entry.Position),
                        ($"placements[{index}].rotationEuler", entry.RotationEuler),
                        ($"placements[{index}].scale", entry.Scale),
                        ($"placements[{index}].faceToward", entry.FaceToward));

                    if (vectors.Failure is { } failure)
                    {
                        return failure;
                    }

                    requests.Add(new ScenePlacementRequest(
                        entry.AssetType, entry.AssetId, entry.VersionId, entry.NodeId, entry.Name, entry.SlotId,
                        vectors.Values[$"placements[{index}].position"],
                        vectors.Values[$"placements[{index}].rotationEuler"],
                        vectors.Values[$"placements[{index}].scale"],
                        entry.GroundSnap, entry.SnapToGrid,
                        vectors.Values[$"placements[{index}].faceToward"],
                        entry.FrontAxis, entry.On, entry.Align, entry.Suspended));
                }

                var result = await handler.Handle(
                    new PlaceSceneAssetsBatchCommand(sceneId, requests, expectedRevision), ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                // Every node this call created, so undo takes the layout back out whole -
                // the reason for placing it in one write in the first place.
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
                 "Pass suspended=true for a node that is meant to hang with nothing under it. " +
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
        [Description("This node is meant to hang in mid-air. Omit to leave its current setting alone; pass false to withdraw the declaration.")] bool? suspended = null,
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
                        groundSnap, suspended, snapToGrid, expectedRevision,
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
                        suspended = result.Value.PreviousSuspended,
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
                        new
                        {
                            status = "ok",
                            scene = result.Value.Scene,
                            removedNode = result.Value.RemovedNode,
                            removedSlot = result.Value.RemovedSlot,
                        },
                        "Scene", sceneId, result.Value,
                        // The node itself, not its id: nothing else records what was there.
                        // The slot goes with it, so the inverse has to carry both or undo
                        // puts the lamp back and loses the open question about it.
                        new { restoredNode = result.Value.RemovedNode, restoredSlot = result.Value.RemovedSlot });
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
    [Description("Dress one node, for this scene only - the model's own default material is untouched. " +
                 "Pass materialId for a parameter material (a colour and a roughness, needs no UVs) - browse those with list_materials - " +
                 "or textureSetId for a tiling global material (needs UVs), from the model's own texture sets. " +
                 "Pass slot to dress one of the model's material slots (\"cushions\") instead of the whole node; " +
                 "get_asset returns a model's materialSlots. Pass clear=true to remove the binding.")]
    public static Task<object> ApplyMaterial(
        ICommandHandler<ApplySceneMaterialCommand, SceneMaterialResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Node id to dress.")] string nodeId,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("Texture set id to bind - a tiling global material. Needs UVs.")] int? textureSetId = null,
        [Description("Optional variant name within the set.")] string? variant = null,
        [Description("Clear the binding instead of setting one.")] bool clear = false,
        [Description("Material id to bind - a parameter material. Needs no UVs, so it is the safe choice on an asset whose unwrap is bad or missing.")] int? materialId = null,
        [Description("Material slot to dress, e.g. \"cushions\". Omit to dress every slot no other binding names.")] string? slot = null,
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
                    new ApplySceneMaterialCommand(
                        sceneId, nodeId, textureSetId, variant, clear, expectedRevision,
                        MaterialId: materialId, Slot: slot), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    // The slot rides along in the before-payload: undoing a slot that had no
                    // binding records a null material, and without the slot name the reverser
                    // would clear the whole node instead of that one slot.
                    : Applied(
                        new { status = "ok", scene = result.Value.Scene, node = result.Value.Node },
                        "Scene", sceneId, result.Value,
                        new { nodeId, slot, material = result.Value.PreviousMaterial });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "set_scene_stage")]
    [Description("Declare how far a scene has been taken: 'layout' (room shell and large forms), 'detail' (props and things resting on things), " +
                 "'lit', then 'dressed' (colour and materials). Work in this order - appearance tuned over a wrong layout is done twice, " +
                 "and levitation is obvious in a grey blockout and easy to miss in a lit, textured render. " +
                 "The stage is enforced, not advisory: MOVING FORWARD IS REFUSED while validate_scene reports a contact or containment ERROR - " +
                 "something resting on nothing, a node not on the surface it says it is on, geometry under the floor. Fix those and call again. " +
                 "Moving back is always allowed, and is how a scene is reopened to fix its composition. " +
                 "Until a scene reaches 'lit' and 'dressed', validate_scene reports missing lights and missing materials as notes instead of warnings, " +
                 "so the findings that matter now are not buried under the ones that do not yet. " +
                 "Returns any contact/containment WARNINGS the scene carried forward - those do not block, but they are the ones worth a second look.")]
    public static Task<object> SetSceneStage(
        ICommandHandler<SetSceneStageCommand, SceneStageResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("The stage: layout | detail | lit | dressed. Omit to stop authoring this scene in stages, which judges it against everything at once.")] string? stage = null,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "set-scene-stage", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new SetSceneStageCommand(sceneId, stage, expectedRevision), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new
                        {
                            status = "ok",
                            scene = result.Value.Scene,
                            stage = result.Value.Stage,
                            previousStage = result.Value.PreviousStage,
                            warnings = result.Value.Warnings,
                        },
                        "Scene", sceneId, result.Value,
                        // Written even when it is null: absent and "was not staged" are
                        // different answers, and the inverse needs the second one.
                        new { stage = result.Value.PreviousStage });
            },
            cancellationToken);
    }

    /// <summary>One proposal for a slot, as an agent states it.</summary>
    public sealed record SlotCandidateProposal(
        [property: Description("Asset family: Model, Sprite or EnvironmentMap. Omit for a candidate that only proposes a surface.")] string? AssetType = null,
        [property: Description("Asset id.")] int? AssetId = null,
        [property: Description("Version id. REQUIRED for Model - a candidate without one would re-point itself when the model gets a new version.")] int? VersionId = null,
        [property: Description("One line on why this one. Say what about it fits the brief; the user reads it next to the measurements.")] string? Rationale = null,
        [property: Description("Optional card label, when the asset's own name is not the useful thing to read.")] string? Label = null,
        [property: Description("Optional texture set to dress it with.")] int? TextureSetId = null,
        [property: Description("Optional material to dress it with. A material and a texture set are two ways to say the same thing - pass one.")] int? MaterialId = null,
        [property: Description("Optional texture-set variant.")] string? Variant = null,
        [property: Description("For a proposal from the companion Asset Store: which store, e.g. https://store.modelibr.com. Pass it with storeAssetId, and never together with assetId - a store asset is a different answer from a library one.")] string? StoreUrl = null,
        [property: Description("The store's asset id (a Guid, from search_store_assets). A store candidate is visibly NOT in the library and cannot be resolved by you: the user accepts it, or you import a free one first.")] string? StoreAssetId = null,
        [property: Description("The store's title for it, copied onto the card so the card still reads when the store is down.")] string? StoreTitle = null,
        [property: Description("The store's thumbnail URL, copied for the same reason.")] string? StoreThumbnailUrl = null,
        [property: Description("What it costs. 0 means you could import it yourself with import_store_asset.")] decimal? StorePrice = null,
        [property: Description("Currency of the price, e.g. USD.")] string? StoreCurrency = null);

    [McpServerTool(Name = "propose_candidates")]
    [Description("Offer the user 2-4 options for one decision in a scene, instead of silently picking one. " +
                 "USE THIS FOR EVERY MEANINGFUL CHOICE - which building is the hero, what the road surface is, which of six sofas. " +
                 "The user previews the options and picks; you do not decide unless they told you to. " +
                 "The slot's node must exist first: place_asset takes a slotId, and this proposes what else that node could be. " +
                 "The asset already standing there becomes the first candidate automatically, so nothing in the scene is an unlisted default. " +
                 "Candidate ids are assigned here (A, B, C...) and never reused - a rejected B stays B and the next proposal is D, " +
                 "so 'streetlight B is too modern' means one thing for the life of the scene. " +
                 "Call get_slots first when re-proposing: it carries the reasons the last round was turned down. " +
                 "Give every candidate a rationale - the user sees it beside the asset's real dimensions and part count. " +
                 "When the scene belongs to a project, every candidate also comes back with a profileFit line measuring it " +
                 "against that project's budget and style - derived here, not from your rationale. Read it back and say which " +
                 "way you went: a candidate that breaks the profile may still be proposed, but say so rather than leaving the " +
                 "card to be the only thing that mentions it. " +
                 "A candidate may also come from the companion Asset Store (storeUrl + storeAssetId): propose one only when the " +
                 "library genuinely cannot fill the slot, say why in the rationale, and never one whose alreadyImported is true. " +
                 "A store candidate is shown as not-yet-owned and CANNOT be resolved by you - the user accepts it, or you import a " +
                 "free one with import_store_asset and then propose the imported asset.")]
    public static Task<object> ProposeCandidates(
        ICommandHandler<ProposeSceneCandidatesCommand, SceneSlotWriteResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("The slot to propose for - the slotId a node in the scene already carries, e.g. 'streetlight'.")] string slotId,
        [Description("The options. Two to four is the useful range: one is a decision you already made, and ten is a list nobody reads.")] SlotCandidateProposal[] candidates,
        [Description("Unique key so a retried call does not propose the same round twice.")] string idempotencyKey,
        [Description("What you were looking for, e.g. 'low-poly, under 3k tris, reads as rundown'. This is what the user is really rejecting when none of them fit - say it once and it sticks for later rounds.")] string? brief = null,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "propose-candidates", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new ProposeSceneCandidatesCommand(
                        sceneId,
                        slotId,
                        (candidates ?? []).Select(c => new SceneCandidateProposal(
                            c.AssetType, c.AssetId, c.VersionId, c.Rationale, c.Label,
                            c.TextureSetId, c.MaterialId, c.Variant,
                            c.StoreUrl, c.StoreAssetId, c.StoreTitle, c.StoreThumbnailUrl,
                            c.StorePrice, c.StoreCurrency)).ToList(),
                        brief,
                        expectedRevision),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", scene = result.Value.Scene, slot = result.Value.Slot },
                        "Scene", sceneId, result.Value,
                        SlotBefore(slotId, result.Value));
            },
            cancellationToken);
    }

    [McpServerTool(Name = "resolve_slot")]
    [Description("Settle a slot on one candidate and apply it to the slot's node. " +
                 "ONLY DO THIS WHEN THE USER ASKED YOU TO PICK ('just choose sensible ones'). Otherwise propose and stop - " +
                 "the decision is theirs, and the scene records which of you made each one. " +
                 "A rejected candidate cannot be chosen: propose it afresh if it should be back on the table. " +
                 "Pass clear=true to reopen a slot; the node keeps wearing whatever it wears, because reopening a question " +
                 "is not the same as withdrawing the answer the user can currently see.")]
    public static Task<object> ResolveSlot(
        ICommandHandler<ResolveSceneSlotCommand, SceneSlotWriteResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("The slot to settle.")] string slotId,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("The candidate id to choose, e.g. 'B'. Omit only with clear=true.")] string? candidateId = null,
        [Description("Reopen the slot instead of choosing.")] bool clear = false,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "resolve-slot", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                // Always recorded as the agent. A tool call is an agent choosing, whatever it
                // was told to do - the UI's own endpoint is the only thing that records a user,
                // which is what keeps "who decided this" answerable rather than claimed.
                var result = await handler.Handle(
                    new ResolveSceneSlotCommand(
                        sceneId, slotId, candidateId, SceneSlotResolvers.Agent, clear, expectedRevision),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", scene = result.Value.Scene, slot = result.Value.Slot },
                        "Scene", sceneId, result.Value,
                        SlotBefore(slotId, result.Value));
            },
            cancellationToken);
    }

    [McpServerTool(Name = "reject_candidates")]
    [Description("Rule candidates out, with the reason - relaying the user's 'not that one, too modern'. " +
                 "Pass all=true for 'none of these': every option still standing is ruled out and the slot reopens for a fresh round. " +
                 "Rejections are feedback, not deletions. They stay on the slot with their reasons, which is what stops the next round " +
                 "re-offering what was just turned down - read them back with get_slots before proposing again.")]
    public static Task<object> RejectCandidates(
        ICommandHandler<RejectSceneCandidatesCommand, SceneSlotWriteResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target scene id.")] int sceneId,
        [Description("The slot the candidates belong to.")] string slotId,
        [Description("Why they were ruled out. Required - a rejection with no reason teaches the next round nothing.")] string reason,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("Candidate ids to reject, e.g. ['B','C']. Omit with all=true.")] string[]? candidateIds = null,
        [Description("Reject every candidate still standing - the user's 'none of these'.")] bool all = false,
        [Description("Optional expected scene revision; the write is refused if the scene has moved on.")] int? expectedRevision = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "reject-candidates", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new RejectSceneCandidatesCommand(
                        sceneId, slotId, candidateIds?.ToList(), reason, all, expectedRevision),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", scene = result.Value.Scene, slot = result.Value.Slot },
                        "Scene", sceneId, result.Value,
                        SlotBefore(slotId, result.Value));
            },
            cancellationToken);
    }

    /// <summary>
    /// The inverse of any slot write: the slot as it stood, plus what its node was wearing.
    ///
    /// One shape for all three, because all three amount to replacing one slot. The node half
    /// is only filled in by <c>resolve_slot</c> - the other two never touch what is on stage -
    /// and a null slot means the write created it, which the restore reads as "remove it again".
    /// </summary>
    private static object SlotBefore(string slotId, SceneSlotWriteResponse response) => new
    {
        slotId,
        slot = response.Previous.Slot,
        node = response.Previous.Node,
    };

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
