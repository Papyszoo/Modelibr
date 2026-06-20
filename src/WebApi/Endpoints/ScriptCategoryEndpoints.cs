using Application.Abstractions.Messaging;
using Application.ScriptCategories;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class ScriptCategoryEndpoints
{
    public static void MapScriptCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/script-categories", GetAllScriptCategories)
            .WithName("Get All Script Categories")
            .WithSummary("Gets all script categories")
            .WithOpenApi();

        app.MapPost("/script-categories", CreateScriptCategory)
            .WithName("Create Script Category")
            .WithSummary("Creates a new script category")
            .WithOpenApi();

        app.MapPut("/script-categories/{id}", UpdateScriptCategory)
            .WithName("Update Script Category")
            .WithSummary("Updates an existing script category")
            .WithOpenApi();

        app.MapDelete("/script-categories/{id}", DeleteScriptCategory)
            .WithName("Delete Script Category")
            .WithSummary("Deletes a script category")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllScriptCategories(
        IQueryHandler<GetAllScriptCategoriesQuery, GetAllScriptCategoriesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllScriptCategoriesQuery(), cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> CreateScriptCategory(
        [FromBody] CreateScriptCategoryRequest request,
        ICommandHandler<CreateScriptCategoryCommand, ScriptCategorySummaryDto> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Category name is required." });
        }

        var result = await commandHandler.Handle(
            new CreateScriptCategoryCommand(request.Name, request.Description, request.ParentId),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/script-categories/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> UpdateScriptCategory(
        int id,
        [FromBody] UpdateScriptCategoryRequest request,
        ICommandHandler<UpdateScriptCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Category name is required." });
        }

        var result = await commandHandler.Handle(
            new UpdateScriptCategoryCommand(id, request.Name, request.Description, request.ParentId),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> DeleteScriptCategory(
        int id,
        ICommandHandler<DeleteScriptCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteScriptCategoryCommand(id), cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateScriptCategoryRequest(string Name, string? Description = null, int? ParentId = null);
public record UpdateScriptCategoryRequest(string Name, string? Description = null, int? ParentId = null);
