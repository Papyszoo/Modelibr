using Application.Abstractions.Messaging;
using Application.Files;
using Application.Scripts;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class ScriptEndpoints
{
    public static void MapScriptEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/scripts", GetAllScripts)
            .WithName("Get All Scripts")
            .WithSummary("Gets all scripts with their file and category information")
            .WithOpenApi();

        app.MapGet("/scripts/{id}", GetScriptById)
            .WithName("Get Script By ID")
            .WithSummary("Gets a specific script by ID")
            .WithOpenApi();

        app.MapPost("/scripts", CreateScript)
            .WithName("Create Script")
            .WithSummary("Creates a script authored in-app (name + language + content)")
            .WithOpenApi();

        app.MapPost("/scripts/with-file", CreateScriptWithFile)
            .WithName("Create Script With File")
            .WithSummary("Creates a new script and uploads a source-code file in one operation")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapPut("/scripts/{id}", UpdateScript)
            .WithName("Update Script")
            .WithSummary("Updates an existing script's name and/or category")
            .WithOpenApi();

        app.MapPut("/scripts/{id}/content", UpdateScriptContent)
            .WithName("Update Script Content")
            .WithSummary("Saves edited source code for a script")
            .WithOpenApi();

        app.MapGet("/scripts/{id}/file", GetScriptFile)
            .WithName("Get Script File")
            .WithSummary("Gets the raw source code of a script for editing")
            .WithOpenApi();

        app.MapDelete("/scripts/{id}", DeleteScript)
            .WithName("Delete Script")
            .WithSummary("Deletes a script")
            .WithOpenApi();

        app.MapDelete("/scripts/{id}/soft", SoftDeleteScript)
            .WithName("Soft Delete Script")
            .WithSummary("Soft deletes a script (marks as deleted)")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllScripts(
        [FromQuery(Name = "packIds")] int[]? packIds,
        [FromQuery(Name = "projectIds")] int[]? projectIds,
        [FromQuery(Name = "categoryIds")] int[]? categoryIds,
        string? searchName,
        string? language,
        int? page,
        int? pageSize,
        IQueryHandler<GetAllScriptsQuery, GetAllScriptsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(
            new GetAllScriptsQuery(
                PackIds: packIds is { Length: > 0 } ? packIds : null,
                ProjectIds: projectIds is { Length: > 0 } ? projectIds : null,
                CategoryIds: categoryIds is { Length: > 0 } ? categoryIds : null,
                SearchName: string.IsNullOrWhiteSpace(searchName) ? null : searchName,
                Language: string.IsNullOrWhiteSpace(language) ? null : language,
                Page: page,
                PageSize: pageSize),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        if (page.HasValue && pageSize.HasValue)
        {
            return Results.Ok(new
            {
                scripts = result.Value.Scripts,
                totalCount = result.Value.TotalCount,
                page = result.Value.Page,
                pageSize = result.Value.PageSize,
                totalPages = result.Value.TotalPages
            });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetScriptById(
        int id,
        IQueryHandler<GetScriptByIdQuery, GetScriptByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetScriptByIdQuery(id), cancellationToken);

        if (result.IsFailure)
        {
            return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value.Script);
    }

    private static async Task<IResult> CreateScript(
        [FromBody] CreateScriptRequest request,
        ICommandHandler<CreateScriptCommand, CreateScriptResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Script name is required." });
        }
        if (string.IsNullOrWhiteSpace(request.Language))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Script language is required." });
        }

        var result = await commandHandler.Handle(
            new CreateScriptCommand(request.Name, request.Language, request.Content, request.CategoryId, request.Description),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/scripts/{result.Value.ScriptId}", result.Value);
    }

    private static async Task<IResult> CreateScriptWithFile(
        IFormFile file,
        string? name,
        int? categoryId,
        ICommandHandler<CreateScriptWithFileCommand, CreateScriptWithFileResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "File is required." });
        }

        var scriptName = name ?? Path.GetFileNameWithoutExtension(file.FileName);

        var result = await commandHandler.Handle(
            new CreateScriptWithFileCommand(
                new WebApi.Files.FormFileUpload(file),
                scriptName,
                categoryId),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/scripts/{result.Value.ScriptId}", result.Value);
    }

    private static async Task<IResult> UpdateScript(
        int id,
        [FromBody] UpdateScriptRequest request,
        ICommandHandler<UpdateScriptCommand, UpdateScriptResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            // A non-null Description means the client included the field and wants
            // it applied (empty string clears it); omitting it leaves it intact.
            new UpdateScriptCommand(id, request.Name, request.CategoryId, request.Description, request.Description is not null),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> UpdateScriptContent(
        int id,
        [FromBody] UpdateScriptContentRequest request,
        ICommandHandler<UpdateScriptContentCommand, UpdateScriptContentResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateScriptContentCommand(id, request.Content ?? string.Empty),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetScriptFile(
        int id,
        IQueryHandler<GetScriptByIdQuery, GetScriptByIdResponse> scriptQueryHandler,
        IQueryHandler<Application.Files.GetFileQuery, Application.Files.GetFileQueryResponse> fileQueryHandler,
        CancellationToken cancellationToken)
    {
        var scriptResult = await scriptQueryHandler.Handle(new GetScriptByIdQuery(id), cancellationToken);
        if (scriptResult.IsFailure)
        {
            return Results.NotFound(new { error = scriptResult.Error.Code, message = scriptResult.Error.Message });
        }

        var fileId = scriptResult.Value.Script.FileId;

        var fileResult = await fileQueryHandler.Handle(new Application.Files.GetFileQuery(fileId), cancellationToken);
        if (fileResult.IsFailure)
        {
            return Results.NotFound(new { error = fileResult.Error.Code, message = fileResult.Error.Message });
        }

        var fileStream = System.IO.File.OpenRead(fileResult.Value.FullPath);
        // Source code is served as UTF-8 text so the editor can read it directly.
        return Results.File(fileStream, "text/plain; charset=utf-8", fileResult.Value.OriginalFileName);
    }

    private static async Task<IResult> DeleteScript(
        int id,
        ICommandHandler<DeleteScriptCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteScriptCommand(id), cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> SoftDeleteScript(
        int id,
        ICommandHandler<SoftDeleteScriptCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new SoftDeleteScriptCommand(id), cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateScriptRequest(string Name, string Language, string? Content, int? CategoryId = null, string? Description = null);
public record UpdateScriptRequest(string? Name, int? CategoryId, string? Description = null);
public record UpdateScriptContentRequest(string? Content);
