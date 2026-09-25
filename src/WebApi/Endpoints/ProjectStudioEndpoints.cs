using Application.Abstractions.Messaging;
using Application.Projects;
using Application.Scenes;
using Domain.Projects;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;

namespace WebApi.Endpoints;

/// <summary>Project level, reference, and production-note HTTP surface.</summary>
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

        app.MapGet("/projects/{projectId:int}/production-notes", GetProductionNotes)
            .WithName("Get Production Notes")
            .WithSummary("List project notes, optionally filtered by level, reference image, character, or pinned state");
        app.MapGet("/projects/{projectId:int}/production-notes/{noteId:int}", GetProductionNote)
            .WithName("Get Production Note")
            .WithSummary("Get one production note owned by the route project");
        app.MapPost("/projects/{projectId:int}/production-notes", CreateProductionNote)
            .WithName("Create Production Note")
            .WithSummary("Create a project, level, reference-image, or character note");
        app.MapPut("/projects/{projectId:int}/production-notes/{noteId:int}", UpdateProductionNote)
            .WithName("Update Production Note")
            .WithSummary("Update a production note and its optional target");
        app.MapDelete("/projects/{projectId:int}/production-notes/{noteId:int}", DeleteProductionNote)
            .WithName("Delete Production Note")
            .WithSummary("Delete a production note");

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

    private static async Task<IResult> GetProductionNotes(
        int projectId,
        int? levelId,
        int? referenceImageId,
        int? characterId,
        bool? isPinned,
        IQueryHandler<GetProductionNotesQuery, IReadOnlyList<ProductionNoteDto>> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(
            new GetProductionNotesQuery(projectId, levelId, referenceImageId, characterId, isPinned), cancellationToken));

    private static async Task<IResult> GetProductionNote(
        int projectId,
        int noteId,
        IQueryHandler<GetProductionNoteByIdQuery, ProductionNoteDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new GetProductionNoteByIdQuery(projectId, noteId), cancellationToken));

    private static async Task<IResult> CreateProductionNote(
        int projectId,
        [FromBody] ProductionNoteRequest request,
        ICommandHandler<CreateProductionNoteCommand, ProductionNoteDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new CreateProductionNoteCommand(
            projectId,
            request.LevelId,
            request.ReferenceImageId,
            request.CharacterId,
            request.Title,
            request.Body,
            request.IsPinned), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/production-notes/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateProductionNote(
        int projectId,
        int noteId,
        [FromBody] ProductionNoteRequest request,
        ICommandHandler<UpdateProductionNoteCommand, ProductionNoteDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new UpdateProductionNoteCommand(
            projectId,
            noteId,
            request.LevelId,
            request.ReferenceImageId,
            request.CharacterId,
            request.Title,
            request.Body,
            request.IsPinned), cancellationToken));

    private static async Task<IResult> DeleteProductionNote(
        int projectId,
        int noteId,
        ICommandHandler<DeleteProductionNoteCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new DeleteProductionNoteCommand(projectId, noteId), cancellationToken);
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
            or "ProductionNoteNotFound"
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

public sealed record ProductionNoteRequest(
    int? LevelId,
    int? ReferenceImageId,
    int? CharacterId,
    string Title,
    string Body,
    bool IsPinned);

public sealed record ProjectReferenceRequest(string? Title);

public sealed record ProjectReferenceLinkRequest(int? ProjectLevelId, int? ProjectCharacterId);

public sealed record SetSceneLevelRequest(
    int? ProjectLevelId,
    bool IsPrimary = false,
    int? ExpectedRevision = null);
