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

    private static IResult Failure(SharedKernel.Error error) =>
        Results.BadRequest(new { error = error.Code, message = error.Message });

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

public record SetSceneLightRequest(
    string? Type = null,
    Vec3? Position = null,
    double? Intensity = null,
    string? Color = null,
    Vec3? Target = null,
    string? Name = null,
    bool? Remove = null,
    int? ExpectedRevision = null);
