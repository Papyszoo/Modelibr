using Application.Abstractions.Messaging;
using Application.SpriteCategories;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class SpriteCategoryEndpoints
{
    public static void MapSpriteCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/sprite-categories", GetAllSpriteCategories)
            .WithName("Get All Sprite Categories")
            .WithSummary("Gets all sprite categories")
            .WithOpenApi();

        app.MapPost("/sprite-categories", CreateSpriteCategory)
            .WithName("Create Sprite Category")
            .WithSummary("Creates a new sprite category")
            .WithOpenApi();

        app.MapPut("/sprite-categories/{id}", UpdateSpriteCategory)
            .WithName("Update Sprite Category")
            .WithSummary("Updates an existing sprite category")
            .WithOpenApi();

        app.MapDelete("/sprite-categories/{id}", DeleteSpriteCategory)
            .WithName("Delete Sprite Category")
            .WithSummary("Deletes a sprite category")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllSpriteCategories(
        IQueryHandler<GetAllSpriteCategoriesQuery, GetAllSpriteCategoriesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllSpriteCategoriesQuery(), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> CreateSpriteCategory(
        [FromBody] CreateSpriteCategoryRequest request,
        ICommandHandler<CreateSpriteCategoryCommand, CreateSpriteCategoryResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Category name is required." });
        }

        var result = await commandHandler.Handle(
            new CreateSpriteCategoryCommand(request.Name, request.Description),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/sprite-categories/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> UpdateSpriteCategory(
        int id,
        [FromBody] UpdateSpriteCategoryRequest request,
        ICommandHandler<UpdateSpriteCategoryCommand, UpdateSpriteCategoryResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Category name is required." });
        }

        var result = await commandHandler.Handle(
            new UpdateSpriteCategoryCommand(id, request.Name, request.Description),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> DeleteSpriteCategory(
        int id,
        ICommandHandler<DeleteSpriteCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteSpriteCategoryCommand(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateSpriteCategoryRequest(string Name, string? Description = null);
public record UpdateSpriteCategoryRequest(string Name, string? Description = null);
