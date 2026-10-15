using Application.Abstractions.Messaging;
using Application.Projects;
using Application.Scenes;
using Domain.Projects;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;

namespace WebApi.Endpoints;

/// <summary>Project level, reference, and comment HTTP surface.</summary>
public static class ProjectStudioEndpoints
{
    public static void MapProjectStudioEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/projects/{projectId:int}/levels", GetLevels)
            .WithName("Get Project Levels")
            .WithSummary("List a project's levels in production order");
        app.MapGet("/projects/{projectId:int}/levels/{levelId:int}", GetLevel)
            .WithName("Get Project Level")
            .WithSummary("Get one level owned by the route project");
        app.MapPost("/projects/{projectId:int}/levels", CreateLevel)
            .WithName("Create Project Level")
            .WithSummary("Create a level in a project");
        app.MapPut("/projects/{projectId:int}/levels/{levelId:int}", UpdateLevel)
            .WithName("Update Project Level")
            .WithSummary("Update a level's name, description, production status, or order");
        app.MapDelete("/projects/{projectId:int}/levels/{levelId:int}", DeleteLevel)
            .WithName("Delete Project Level")
            .WithSummary("Delete a level without deleting its scenes");

        app.MapGet("/projects/{projectId:int}/comments", GetProjectComments)
            .WithName("Get Project Comments")
            .WithSummary("List project comments, optionally filtered by target, pinned state, or status");
        app.MapGet("/projects/{projectId:int}/comments/{commentId:int}", GetProjectComment)
            .WithName("Get Project Comment")
            .WithSummary("Get one comment owned by the route project");
        app.MapPost("/projects/{projectId:int}/comments", CreateProjectComment)
            .WithName("Create Project Comment")
            .WithSummary("Comment on a project, or on one of its levels, references, characters, or assets");
        app.MapPut("/projects/{projectId:int}/comments/{commentId:int}", UpdateProjectComment)
            .WithName("Update Project Comment")
            .WithSummary("Update a comment, its optional target, and its open or resolved status");
        app.MapDelete("/projects/{projectId:int}/comments/{commentId:int}", DeleteProjectComment)
            .WithName("Delete Project Comment")
            .WithSummary("Delete a comment");

        app.MapGet("/projects/{projectId:int}/references", GetProjectReferences)
            .WithName("Get Project References")
            .WithSummary("List project reference images, optionally filtered by level or character");
        app.MapPut("/projects/{projectId:int}/references/{referenceId:int}", UpdateProjectReference)
            .WithName("Update Project Reference")
            .WithSummary("Title a reference image");
        app.MapPost("/projects/{projectId:int}/references/{referenceId:int}/links", AddProjectReferenceLink)
            .WithName("Add Project Reference Link")
            .WithSummary("Link a reference image to a same-project level or character");
        app.MapDelete(
            "/projects/{projectId:int}/references/{referenceId:int}/links/{linkId:int}",
            RemoveProjectReferenceLink)
            .WithName("Remove Project Reference Link")
            .WithSummary("Unlink a reference image from a level or character");

        app.MapPut("/scenes/{sceneId:int}/level", SetSceneLevel)
            .WithName("Set Scene Level")
            .WithSummary("Link a scene to a same-project level and optionally make it primary");
    }

    private static async Task<IResult> GetLevels(
        int projectId,
        IQueryHandler<GetProjectLevelsQuery, IReadOnlyList<ProjectLevelDto>> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new GetProjectLevelsQuery(projectId), cancellationToken));

    private static async Task<IResult> GetLevel(
        int projectId,
        int levelId,
        IQueryHandler<GetProjectLevelByIdQuery, ProjectLevelDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new GetProjectLevelByIdQuery(projectId, levelId), cancellationToken));

    private static async Task<IResult> CreateLevel(
        int projectId,
        [FromBody] ProjectLevelRequest request,
        ICommandHandler<CreateProjectLevelCommand, ProjectLevelDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new CreateProjectLevelCommand(
            projectId,
            request.Name,
            request.Description,
            request.ProductionStatus,
            request.SortOrder), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/levels/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateLevel(
        int projectId,
        int levelId,
        [FromBody] ProjectLevelRequest request,
        ICommandHandler<UpdateProjectLevelCommand, ProjectLevelDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new UpdateProjectLevelCommand(
            projectId,
            levelId,
            request.Name,
            request.Description,
            request.ProductionStatus,
            request.SortOrder), cancellationToken);
        return Respond(result);
    }

    private static async Task<IResult> DeleteLevel(
        int projectId,
        int levelId,
        ICommandHandler<DeleteProjectLevelCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new DeleteProjectLevelCommand(projectId, levelId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result);
    }

    private static async Task<IResult> GetProjectComments(
        int projectId,
        [AsParameters] ProjectCommentTargetQuery target,
        bool? isPinned,
        string? status,
        IQueryHandler<GetProjectCommentsQuery, IReadOnlyList<ProjectCommentDto>> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(
            new GetProjectCommentsQuery(projectId, target.ToTarget(), isPinned, status), cancellationToken));

    private static async Task<IResult> GetProjectComment(
        int projectId,
        int commentId,
        IQueryHandler<GetProjectCommentByIdQuery, ProjectCommentDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new GetProjectCommentByIdQuery(projectId, commentId), cancellationToken));

    private static async Task<IResult> CreateProjectComment(
        int projectId,
        [FromBody] ProjectCommentRequest request,
        ICommandHandler<CreateProjectCommentCommand, ProjectCommentDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new CreateProjectCommentCommand(
            projectId,
            request.ToTarget(),
            request.Title,
            request.Body,
            request.IsPinned), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/comments/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateProjectComment(
        int projectId,
        int commentId,
        [FromBody] ProjectCommentRequest request,
        ICommandHandler<UpdateProjectCommentCommand, ProjectCommentDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new UpdateProjectCommentCommand(
            projectId,
            commentId,
            request.ToTarget(),
            request.Title,
            request.Body,
            request.IsPinned,
            request.Status,
            request.Resolution), cancellationToken));

    private static async Task<IResult> DeleteProjectComment(
        int projectId,
        int commentId,
        ICommandHandler<DeleteProjectCommentCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new DeleteProjectCommentCommand(projectId, commentId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result);
    }

    private static async Task<IResult> GetProjectReferences(
        int projectId,
        int? levelId,
        int? characterId,
        IQueryHandler<GetProjectReferencesQuery, IReadOnlyList<ProjectReferenceDto>> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(
            new GetProjectReferencesQuery(projectId, levelId, characterId), cancellationToken));

    private static async Task<IResult> UpdateProjectReference(
        int projectId,
        int referenceId,
        [FromBody] ProjectReferenceRequest request,
        ICommandHandler<UpdateProjectReferenceCommand, ProjectReferenceDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new UpdateProjectReferenceCommand(
            projectId, referenceId, request.Title), cancellationToken));

    private static async Task<IResult> AddProjectReferenceLink(
        int projectId,
        int referenceId,
        [FromBody] ProjectReferenceLinkRequest request,
        ICommandHandler<AddProjectReferenceLinkCommand, ProjectReferenceLinkDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new AddProjectReferenceLinkCommand(
            projectId, referenceId, request.ProjectLevelId, request.ProjectCharacterId), cancellationToken);
        return result.IsSuccess
            ? Results.Created(
                $"/projects/{projectId}/references/{referenceId}/links",
                result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> RemoveProjectReferenceLink(
        int projectId,
        int referenceId,
        int linkId,
        ICommandHandler<RemoveProjectReferenceLinkCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(
            new RemoveProjectReferenceLinkCommand(projectId, referenceId, linkId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result.Error);
    }

    private static async Task<IResult> SetSceneLevel(
        int sceneId,
        [FromBody] SetSceneLevelRequest request,
        ICommandHandler<SetSceneLevelCommand, SetSceneLevelResponse> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new SetSceneLevelCommand(
            sceneId,
            request.ProjectLevelId,
            request.IsPrimary,
            request.ExpectedRevision), cancellationToken));

    private static IResult Respond<T>(Result<T> result) =>
        result.IsSuccess ? Results.Ok(result.Value) : Respond(result.Error);

    private static IResult Respond(Result result) =>
        result.IsSuccess ? Results.NoContent() : Respond(result.Error);

    private static IResult Respond(Error error)
    {
        var body = new { error = error.Code, message = error.Message };
        return error.Code is "ProjectNotFound"
            or "ProjectLevelNotFound"
            or "ProjectCommentNotFound"
            or "ProjectReferenceNotFound"
            or "ProjectReferenceLinkNotFound"
            or "ProjectCharacterNotFound"
            or "SceneNotFound"
            ? Results.NotFound(body)
            : Results.BadRequest(body);
    }
}

public sealed record ProjectLevelRequest(
    string Name,
    string? Description,
    string? ProductionStatus = null,
    int? SortOrder = null);

/// <summary>
/// A comment's content and target. On update, <see cref="Status"/> null keeps the current
/// status and resolution.
/// </summary>
public sealed record ProjectCommentRequest(
    int? LevelId,
    int? ReferenceImageId,
    int? CharacterId,
    string Title,
    string Body,
    bool IsPinned,
    int? ModelId = null,
    int? TextureSetId = null,
    int? SpriteId = null,
    int? SoundId = null,
    int? EnvironmentMapId = null,
    int? VfxId = null,
    string? Status = null,
    string? Resolution = null)
{
    public ProjectCommentTarget ToTarget() => new(
        LevelId, ReferenceImageId, CharacterId, ModelId, TextureSetId,
        SpriteId, SoundId, EnvironmentMapId, VfxId);
}

/// <summary>The optional target filters of a comment list, bound from the query string.</summary>
public sealed record ProjectCommentTargetQuery(
    int? LevelId,
    int? ReferenceImageId,
    int? CharacterId,
    int? ModelId,
    int? TextureSetId,
    int? SpriteId,
    int? SoundId,
    int? EnvironmentMapId,
    int? VfxId)
{
    public ProjectCommentTarget ToTarget() => new(
        LevelId, ReferenceImageId, CharacterId, ModelId, TextureSetId,
        SpriteId, SoundId, EnvironmentMapId, VfxId);
}

public sealed record ProjectReferenceRequest(string? Title);

public sealed record ProjectReferenceLinkRequest(int? ProjectLevelId, int? ProjectCharacterId);

public sealed record SetSceneLevelRequest(
    int? ProjectLevelId,
    bool IsPrimary = false,
    int? ExpectedRevision = null);
