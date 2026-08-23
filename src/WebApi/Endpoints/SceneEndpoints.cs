using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Scenes;
using Domain.Scenes;
using Microsoft.AspNetCore.Mvc;
using WebApi.Files;
using WebApi.Infrastructure;

namespace WebApi.Endpoints;

/// <summary>
/// The scene REST surface. The MCP scene tools are a thin pass-through over these same
/// handlers, so an agent and the editor cannot drift into two different notions of what a
/// scene edit does.
/// </summary>
public static class SceneEndpoints
{
    public static void MapSceneEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/scenes", async (
            IQueryHandler<GetAllScenesQuery, GetAllScenesResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new GetAllScenesQuery(), cancellationToken);
            return result.IsFailure ? Failure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Get All Scenes")
        .WithSummary("List saved scenes");

        app.MapPost("/scenes/resources/resolve", async (
            ResolveSceneResourcesRequest request,
            IQueryHandler<ResolveSceneResourcesQuery, SceneResourceManifest> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new ResolveSceneResourcesQuery(request.Assets), cancellationToken);
            return result.IsFailure ? Failure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Resolve Scene Resources")
        .WithSummary("Resolve files and measured display costs for scene asset references in one batch");

        // Sits alongside /scenes/{id}: a literal segment outranks a parameter one in route
        // precedence, so "asset-facts" is never captured as an id.
        app.MapGet("/scenes/asset-facts", async (
            string assetType,
            int assetId,
            int? versionId,
            IQueryHandler<GetSceneAssetFactsQuery, SceneAssetFactsView> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new GetSceneAssetFactsQuery(assetType, assetId, versionId), cancellationToken);
            return result.IsFailure ? Failure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Get Scene Asset Facts")
        .WithSummary("Size, origin convention and resting height for an asset, before placing it");

        // Asked before deleting an asset: a scene that references a recycled model still
        // loads, still names it, and shows a node that will never render (prompt 13-C).
        app.MapGet("/scenes/using/{assetType}/{assetId:int}", async (
            string assetType,
            int assetId,
            IQueryHandler<GetScenesUsingAssetQuery, ScenesUsingAssetResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new GetScenesUsingAssetQuery(assetType, assetId), cancellationToken);
            return result.IsFailure ? Failure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Get Scenes Using Asset")
        .WithSummary("Which scenes reference an asset - the question asked before deleting it");

        app.MapGet("/scenes/{id}", async (
            int id,
            IQueryHandler<GetSceneByIdQuery, SceneView> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new GetSceneByIdQuery(id), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Get Scene By Id")
        .WithSummary("Get a scene, its document, per-node footprints, overlaps and scale warnings");

        app.MapGet("/scenes/{id}/validate", async (
            int id,
            IQueryHandler<ValidateSceneQuery, SceneValidationView> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new ValidateSceneQuery(id), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Validate Scene")
        .WithSummary("Check a scene for contact, containment, identity, orientation, appearance and scale problems");

        app.MapPost("/scenes", async (
            CreateSceneRequest request,
            ICommandHandler<CreateSceneCommand, SceneView> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new CreateSceneCommand(request.Name, request.Description, request.DocumentJson), cancellationToken);
            return result.IsFailure
                ? Failure(result.Error)
                : Results.Created($"/scenes/{result.Value.Scene.Id}", result.Value);
        })
        .WithName("Create Scene")
        .WithSummary("Create a scene, optionally from a document");

        app.MapPut("/scenes/{id}/document", async (
            int id,
            UpdateSceneDocumentRequest request,
            ICommandHandler<UpdateSceneDocumentCommand, SceneView> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new UpdateSceneDocumentCommand(id, request.DocumentJson, request.ExpectedRevision), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Update Scene Document")
        .WithSummary("Replace a scene's document; rejects an invalid one rather than repairing it");

        app.MapPut("/scenes/{id}/stage", async (
            int id,
            SetSceneStageRequest request,
            ICommandHandler<SetSceneStageCommand, SceneStageResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new SetSceneStageCommand(id, request.Stage, request.ExpectedRevision), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Set Scene Stage")
        .WithSummary("Declare how far a scene has been taken; advancing is refused over a broken composition");

        app.MapPut("/scenes/{id}", async (
            int id,
            RenameSceneRequest request,
            ICommandHandler<RenameSceneCommand, SceneSummary> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new RenameSceneCommand(id, request.Name, request.Description), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Rename Scene")
        .WithSummary("Rename a scene or change its description");

        app.MapDelete("/scenes/{id}", async (
            int id,
            ICommandHandler<DeleteSceneCommand> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new DeleteSceneCommand(id), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.NoContent();
        })
        .WithName("Delete Scene")
        .WithSummary("Delete a scene");

        app.MapPost("/scenes/{id}/nodes", async (
            int id,
            PlaceSceneAssetRequest request,
            ICommandHandler<PlaceSceneAssetCommand, ScenePlacementResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new PlaceSceneAssetCommand(
                    id, request.AssetType, request.AssetId, request.VersionId, request.NodeId, request.Name,
                    request.SlotId, request.Position, request.RotationEuler, request.Scale,
                    request.GroundSnap ?? false, request.SnapToGrid, request.ExpectedRevision,
                    request.FaceToward, request.FrontAxis, request.On, request.Align,
                    request.Suspended ?? false),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Place Scene Asset")
        .WithSummary("Place a library asset into a scene");

        app.MapPost("/scenes/{id}/nodes/batch", async (
            int id,
            PlaceSceneAssetsBatchRequest request,
            ICommandHandler<PlaceSceneAssetsBatchCommand, SceneBatchPlacementResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new PlaceSceneAssetsBatchCommand(
                    id,
                    (request.Placements ?? []).Select(ToPlacement).ToList(),
                    request.ExpectedRevision),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Place Scene Assets Batch")
        .WithSummary("Place a heterogeneous layout into a scene in one write");

        app.MapPut("/scenes/{id}/nodes/{nodeId}", async (
            int id,
            string nodeId,
            MoveSceneNodeRequest request,
            ICommandHandler<MoveSceneNodeCommand, SceneNodeMoveResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new MoveSceneNodeCommand(
                    id, nodeId, request.Position, request.RotationEuler, request.Scale,
                    request.GroundSnap, request.Suspended, request.SnapToGrid, request.ExpectedRevision,
                    request.FaceToward, request.FrontAxis, request.On, request.Align,
                    DetachAnchor: request.DetachAnchor ?? false),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Move Scene Node")
        .WithSummary("Move, rotate or rescale one node");

        app.MapDelete("/scenes/{id}/nodes/{nodeId}", async (
            int id,
            string nodeId,
            int? expectedRevision,
            ICommandHandler<RemoveSceneNodeCommand, SceneNodeRemovalResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new RemoveSceneNodeCommand(id, nodeId, expectedRevision), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Remove Scene Node")
        .WithSummary("Remove a node, returning it so the removal can be undone");

        app.MapPut("/scenes/{id}/nodes/{nodeId}/material", async (
            int id,
            string nodeId,
            ApplySceneMaterialRequest request,
            ICommandHandler<ApplySceneMaterialCommand, SceneMaterialResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new ApplySceneMaterialCommand(
                    id, nodeId, request.TextureSetId, request.Variant, request.Clear ?? false, request.ExpectedRevision),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Apply Scene Material")
        .WithSummary("Bind a texture set to one node, scene-locally");

        app.MapPut("/scenes/{id}/lights/{lightId}", async (
            int id,
            string lightId,
            SetSceneLightRequest request,
            ICommandHandler<SetSceneLightCommand, SceneLightResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new SetSceneLightCommand(
                    id, lightId, request.Type, request.Position, request.Intensity, request.Color,
                    request.Target, request.Name, request.Remove ?? false, request.ExpectedRevision),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Set Scene Light")
        .WithSummary("Add, update or remove one light by id");

        app.MapGet("/scenes/{id}/slots", async (
            int id,
            IQueryHandler<GetSceneSlotsQuery, SceneSlotsView> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new GetSceneSlotsQuery(id), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Get Scene Slots")
        .WithSummary("The decisions in this scene, their candidates, and what is known about each one");

        app.MapPost("/scenes/{id}/slots/{slotId}/candidates", async (
            int id,
            string slotId,
            ProposeSceneCandidatesRequest request,
            ICommandHandler<ProposeSceneCandidatesCommand, SceneSlotWriteResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new ProposeSceneCandidatesCommand(
                    id, slotId, request.Candidates ?? [], request.Brief, request.ExpectedRevision),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Propose Scene Candidates")
        .WithSummary("Offer options for one slot, without deciding it");

        // The UI's choose button. resolvedBy is fixed to "user" here and is not a field on
        // the request: this endpoint is only ever reached by a person clicking, and letting a
        // body claim otherwise would make the one attribution the model exists to keep a
        // caller-supplied string.
        app.MapPut("/scenes/{id}/slots/{slotId}/choice", async (
            int id,
            string slotId,
            ResolveSceneSlotRequest request,
            ICommandHandler<ResolveSceneSlotCommand, SceneSlotWriteResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new ResolveSceneSlotCommand(
                    id, slotId, request.CandidateId, SceneSlotResolvers.User,
                    request.Clear ?? false, request.ExpectedRevision),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Resolve Scene Slot")
        .WithSummary("Settle a slot on one candidate, or reopen it");

        app.MapPost("/scenes/{id}/slots/{slotId}/rejections", async (
            int id,
            string slotId,
            RejectSceneCandidatesRequest request,
            ICommandHandler<RejectSceneCandidatesCommand, SceneSlotWriteResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new RejectSceneCandidatesCommand(
                    id, slotId, request.CandidateIds, request.Reason ?? string.Empty,
                    request.All ?? false, request.ExpectedRevision),
                cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Reject Scene Candidates")
        .WithSummary("Rule candidates out with a reason, or reject the whole round");

        app.MapPost("/scenes/{id}/render", async (
            int id,
            RequestSceneRenderRequest? request,
            ICommandHandler<RequestSceneRenderCommand, RequestSceneRenderResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new RequestSceneRenderCommand(id, request?.Viewpoint), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Accepted(value: result.Value);
        })
        .WithName("Request Scene Render")
        .WithSummary("Queue a picture of the scene from one viewpoint");

        app.MapGet("/scene-renders/{renderId}", async (
            int renderId,
            IQueryHandler<GetSceneRenderQuery, SceneRenderView> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new GetSceneRenderQuery(renderId), cancellationToken);
            return result.IsFailure ? NotFoundOrFailure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Get Scene Render")
        .WithSummary("Collect a queued render, or find out it is still being drawn");

        app.MapGet("/scene-renders/{renderId}/file", async (
            int renderId,
            IQueryHandler<GetSceneRenderQuery, SceneRenderView> handler,
            ISceneRenderRepository renderRepository,
            CancellationToken cancellationToken) =>
        {
            var render = await renderRepository.GetByJobIdAsync(renderId, cancellationToken);
            if (render is null || !System.IO.File.Exists(render.FilePath))
            {
                return Results.NotFound();
            }

            return Results.File(render.FilePath, "image/png");
        })
        .WithName("Serve Scene Render")
        .WithSummary("The rendered image itself");

        // Worker-facing. The bytes come up as multipart while the job's own lifecycle
        // transition stays a separate small call, so a large upload never holds a queue
        // transition open - the same split the thumbnail path uses.
        app.MapPost("/thumbnail-jobs/scenes/{jobId}/render-upload", async (
            int jobId,
            IFormFile file,
            [FromForm] int width,
            [FromForm] int height,
            [FromForm] int nodesLoaded,
            [FromForm] int nodesFailed,
            [FromForm] bool timedOut,
            ICommandHandler<UploadSceneRenderCommand, UploadSceneRenderCommandResponse> handler,
            CancellationToken cancellationToken) =>
        {
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "InvalidFile", message = "A render file must be provided." });
            }

            var result = await handler.Handle(
                new UploadSceneRenderCommand(
                    jobId, new FormFileUpload(file), width, height, nodesLoaded, nodesFailed, timedOut),
                cancellationToken);

            return result.IsFailure ? Failure(result.Error) : Results.Ok(result.Value);
        })
        .WithName("Upload Scene Render")
        .WithTags("Thumbnails")
        .AddEndpointFilter<WorkerApiKeyFilter>()
        .DisableAntiforgery();
    }

    public sealed record ResolveSceneResourcesRequest(IReadOnlyList<SceneAssetRef>? Assets);

    private static IResult Failure(SharedKernel.Error error) =>
        Results.BadRequest(new { error = error.Code, message = error.Message });

    /// <summary>
    /// A REST placement in the shared vocabulary the batch command speaks. Kept here rather
    /// than on the request record so the wire type stays a plain DTO.
    /// </summary>
    private static ScenePlacementRequest ToPlacement(PlaceSceneAssetRequest request) =>
        new(request.AssetType, request.AssetId, request.VersionId, request.NodeId, request.Name,
            request.SlotId, request.Position, request.RotationEuler, request.Scale,
            request.GroundSnap ?? false, request.SnapToGrid, request.FaceToward, request.FrontAxis,
            request.On, request.Align, request.Suspended ?? false);

    /// <summary>
    /// "Not found" is the one failure that deserves its own status here: the editor and an
    /// agent both need to tell "this scene is gone" apart from "your edit was wrong", and a
    /// 400 for both makes a deleted scene look like a bad request forever.
    /// </summary>
    private static IResult NotFoundOrFailure(SharedKernel.Error error) =>
        error.Code is "Scene.NotFound" or "Scene.NodeNotFound" or "Scene.LightNotFound"
            // A render id that names nothing belongs here for the same reason: the
            // caller polling for one has to tell "not drawn yet" from "wrong id", and
            // a 400 makes a lost id look like a malformed request forever.
            or "SceneRender.NotFound"
            ? Results.NotFound(new { error = error.Code, message = error.Message })
            : Failure(error);
}

public record RequestSceneRenderRequest(string? Viewpoint = null);

public record CreateSceneRequest(string Name, string? Description = null, string? DocumentJson = null);

public record UpdateSceneDocumentRequest(string DocumentJson, int? ExpectedRevision = null);

public record RenameSceneRequest(string Name, string? Description = null);

/// <summary>Null <c>Stage</c> means "stop authoring this scene in stages" - see <c>SetSceneStageCommand</c>.</summary>
public record SetSceneStageRequest(string? Stage = null, int? ExpectedRevision = null);

public record PlaceSceneAssetRequest(
    string AssetType,
    int AssetId,
    int? VersionId = null,
    string? NodeId = null,
    string? Name = null,
    string? SlotId = null,
    Vec3? Position = null,
    Vec3? RotationEuler = null,
    Vec3? Scale = null,
    bool? GroundSnap = null,
    double? SnapToGrid = null,
    int? ExpectedRevision = null,
    Vec3? FaceToward = null,
    string? FrontAxis = null,
    string? On = null,
    string? Align = null,
    bool? Suspended = null);

/// <summary>
/// A heterogeneous layout applied in one write. Entries are applied in array order, so an
/// entry may rest <c>On</c> a node an earlier entry created.
/// </summary>
public record PlaceSceneAssetsBatchRequest(
    IReadOnlyList<PlaceSceneAssetRequest>? Placements,
    int? ExpectedRevision = null);

public record MoveSceneNodeRequest(
    Vec3? Position = null,
    Vec3? RotationEuler = null,
    Vec3? Scale = null,
    bool? GroundSnap = null,
    double? SnapToGrid = null,
    int? ExpectedRevision = null,
    Vec3? FaceToward = null,
    string? FrontAxis = null,
    string? On = null,
    string? Align = null,
    bool? DetachAnchor = null,
    bool? Suspended = null);

public record ApplySceneMaterialRequest(
    int? TextureSetId = null,
    string? Variant = null,
    bool? Clear = null,
    int? ExpectedRevision = null);

public record ProposeSceneCandidatesRequest(
    IReadOnlyList<SceneCandidateProposal>? Candidates = null,
    string? Brief = null,
    int? ExpectedRevision = null);

/// <summary>Null <c>CandidateId</c> with <c>Clear</c> set reopens the slot.</summary>
public record ResolveSceneSlotRequest(
    string? CandidateId = null,
    bool? Clear = null,
    int? ExpectedRevision = null);

/// <summary><c>All</c> is the user's "none of these": every candidate still standing is ruled out and the slot reopens.</summary>
public record RejectSceneCandidatesRequest(
    string? Reason = null,
    IReadOnlyList<string>? CandidateIds = null,
    bool? All = null,
    int? ExpectedRevision = null);

public record SetSceneLightRequest(
    string? Type = null,
    Vec3? Position = null,
    double? Intensity = null,
    string? Color = null,
    Vec3? Target = null,
    string? Name = null,
    bool? Remove = null,
    int? ExpectedRevision = null);
