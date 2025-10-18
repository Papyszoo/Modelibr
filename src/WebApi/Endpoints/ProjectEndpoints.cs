using Application.Abstractions.Messaging;
using Application.Projects;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class ProjectEndpoints
{
    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        // Project CRUD
        app.MapGet("/projects", GetAllProjects)
            .WithName("Get All Projects")
            .WithSummary("Retrieves all projects")
            .WithOpenApi();

        app.MapGet("/projects/{id}", GetProjectById)
            .WithName("Get Project by ID")
            .WithSummary("Retrieves a project by its ID")
            .WithOpenApi();

        app.MapPost("/projects", CreateProject)
            .WithName("Create Project")
            .WithSummary("Creates a new project")
            .WithOpenApi();

        app.MapPut("/projects/{id}", UpdateProject)
            .WithName("Update Project")
            .WithSummary("Updates an existing project")
            .WithOpenApi();

        app.MapDelete("/projects/{id}", DeleteProject)
            .WithName("Delete Project")
            .WithSummary("Deletes a project")
            .WithOpenApi();

        // Project-Model association
        app.MapPost("/projects/{projectId}/models/{modelId}", AddModelToProject)
            .WithName("Add Model to Project")
            .WithSummary("Adds a model to the specified project")
            .WithOpenApi();

        app.MapDelete("/projects/{projectId}/models/{modelId}", RemoveModelFromProject)
            .WithName("Remove Model from Project")
            .WithSummary("Removes a model from the specified project")
            .WithOpenApi();

        // Project-TextureSet association
        app.MapPost("/projects/{projectId}/texture-sets/{textureSetId}", AddTextureSetToProject)
            .WithName("Add Texture Set to Project")
            .WithSummary("Adds a texture set to the specified project")
            .WithOpenApi();

        app.MapPost("/projects/{projectId}/textures/with-file", AddTextureToProjectWithFile)
            .WithName("Add Texture to Project with File")
            .WithSummary("Uploads a file, creates a texture set, and adds it to the project in one operation")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapDelete("/projects/{projectId}/texture-sets/{textureSetId}", RemoveTextureSetFromProject)
            .WithName("Remove Texture Set from Project")
            .WithSummary("Removes a texture set from the specified project")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllProjects(
        IQueryHandler<GetAllProjectsQuery, GetAllProjectsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var query = new GetAllProjectsQuery();
        var result = await queryHandler.Handle(query, cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> GetProjectById(
        int id,
        IQueryHandler<GetProjectByIdQuery, ProjectDto> queryHandler,
        CancellationToken cancellationToken)
    {
        var query = new GetProjectByIdQuery(id);
        var result = await queryHandler.Handle(query, cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.NotFound(result.Error);
    }

    private static async Task<IResult> CreateProject(
        [FromBody] CreateProjectRequest request,
        ICommandHandler<CreateProjectCommand, CreateProjectResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new CreateProjectCommand(request.Name, request.Description);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/projects/{result.Value.Id}", result.Value)
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> UpdateProject(
        int id,
        [FromBody] UpdateProjectRequest request,
        ICommandHandler<UpdateProjectCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new UpdateProjectCommand(id, request.Name, request.Description);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> DeleteProject(
        int id,
        ICommandHandler<DeleteProjectCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new DeleteProjectCommand(id);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.NotFound(result.Error);
    }

    private static async Task<IResult> AddModelToProject(
        int projectId,
        int modelId,
        ICommandHandler<AddModelToProjectCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new AddModelToProjectCommand(projectId, modelId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> RemoveModelFromProject(
        int projectId,
        int modelId,
        ICommandHandler<RemoveModelFromProjectCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new RemoveModelFromProjectCommand(projectId, modelId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> AddTextureSetToProject(
        int projectId,
        int textureSetId,
        ICommandHandler<AddTextureSetToProjectCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new AddTextureSetToProjectCommand(projectId, textureSetId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> RemoveTextureSetFromProject(
        int projectId,
        int textureSetId,
        ICommandHandler<RemoveTextureSetFromProjectCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new RemoveTextureSetFromProjectCommand(projectId, textureSetId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> AddTextureToProjectWithFile(
        int projectId,
        [FromForm] IFormFile file,
        [FromForm] string name,
        [FromForm] int textureType,
        [FromQuery] string? batchId,
        [FromQuery] string? uploadType,
        ICommandHandler<AddTextureToProjectWithFileCommand, int> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new AddTextureToProjectWithFileCommand(
            projectId,
            new Files.FormFileUpload(file),
            name,
            (Domain.ValueObjects.TextureType)textureType,
            batchId,
            uploadType
        );

        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.Ok(new { textureSetId = result.Value })
            : Results.BadRequest(result.Error);
    }
}

// Request DTOs
public record CreateProjectRequest(string Name, string? Description);
public record UpdateProjectRequest(string Name, string? Description);
