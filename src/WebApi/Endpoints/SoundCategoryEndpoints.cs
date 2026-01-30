using Application.Abstractions.Messaging;
using Application.SoundCategories;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class SoundCategoryEndpoints
{
    public static void MapSoundCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/sound-categories", GetAllSoundCategories)
            .WithName("Get All Sound Categories")
            .WithSummary("Gets all sound categories")
            .WithOpenApi();

        app.MapPost("/sound-categories", CreateSoundCategory)
            .WithName("Create Sound Category")
            .WithSummary("Creates a new sound category")
            .WithOpenApi();

        app.MapPut("/sound-categories/{id}", UpdateSoundCategory)
            .WithName("Update Sound Category")
            .WithSummary("Updates an existing sound category")
            .WithOpenApi();

        app.MapDelete("/sound-categories/{id}", DeleteSoundCategory)
            .WithName("Delete Sound Category")
            .WithSummary("Deletes a sound category")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllSoundCategories(
        IQueryHandler<GetAllSoundCategoriesQuery, GetAllSoundCategoriesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllSoundCategoriesQuery(), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> CreateSoundCategory(
        [FromBody] CreateSoundCategoryRequest request,
        ICommandHandler<CreateSoundCategoryCommand, CreateSoundCategoryResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Category name is required." });
        }

        var result = await commandHandler.Handle(
            new CreateSoundCategoryCommand(request.Name, request.Description),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/sound-categories/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> UpdateSoundCategory(
        int id,
        [FromBody] UpdateSoundCategoryRequest request,
        ICommandHandler<UpdateSoundCategoryCommand, UpdateSoundCategoryResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Category name is required." });
        }

        var result = await commandHandler.Handle(
            new UpdateSoundCategoryCommand(id, request.Name, request.Description),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> DeleteSoundCategory(
        int id,
        ICommandHandler<DeleteSoundCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteSoundCategoryCommand(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateSoundCategoryRequest(string Name, string? Description = null);
public record UpdateSoundCategoryRequest(string Name, string? Description = null);
