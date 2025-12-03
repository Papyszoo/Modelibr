using Application.Abstractions.Messaging;
using Application.Sprites;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class SpriteEndpoints
{
    public static void MapSpriteEndpoints(this IEndpointRouteBuilder app)
    {
        // CRUD operations
        app.MapGet("/sprites", GetAllSprites)
            .WithName("Get All Sprites")
            .WithSummary("Gets all sprites with their file and category information")
            .WithOpenApi();

        app.MapGet("/sprites/{id}", GetSpriteById)
            .WithName("Get Sprite By ID")
            .WithSummary("Gets a specific sprite by ID")
            .WithOpenApi();

        app.MapPost("/sprites", CreateSprite)
            .WithName("Create Sprite")
            .WithSummary("Creates a new sprite")
            .WithOpenApi();

        app.MapPost("/sprites/with-file", CreateSpriteWithFile)
            .WithName("Create Sprite With File")
            .WithSummary("Creates a new sprite and uploads a file in one operation")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapPut("/sprites/{id}", UpdateSprite)
            .WithName("Update Sprite")
            .WithSummary("Updates an existing sprite")
            .WithOpenApi();

        app.MapDelete("/sprites/{id}", DeleteSprite)
            .WithName("Delete Sprite")
            .WithSummary("Deletes a sprite")
            .WithOpenApi();

        app.MapDelete("/sprites/{id}/soft", SoftDeleteSprite)
            .WithName("Soft Delete Sprite")
            .WithSummary("Soft deletes a sprite (marks as deleted)")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllSprites(
        int? packId,
        int? projectId,
        int? categoryId,
        IQueryHandler<GetAllSpritesQuery, GetAllSpritesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllSpritesQuery(packId, projectId, categoryId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetSpriteById(
        int id,
        IQueryHandler<GetSpriteByIdQuery, GetSpriteByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetSpriteByIdQuery(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value.Sprite);
    }

    private static async Task<IResult> CreateSprite(
        [FromBody] CreateSpriteRequest request,
        ICommandHandler<CreateSpriteCommand, CreateSpriteResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Sprite name is required." });
        }

        var result = await commandHandler.Handle(
            new CreateSpriteCommand(request.Name, request.FileId, request.SpriteType, request.CategoryId),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/sprites/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> CreateSpriteWithFile(
        IFormFile file,
        string? name,
        SpriteType? spriteType,
        int? categoryId,
        string? batchId,
        ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "File is required." });
        }

        // Use file name without extension as default sprite name
        var spriteName = name ?? Path.GetFileNameWithoutExtension(file.FileName);
        var type = spriteType ?? SpriteType.Static;

        var result = await commandHandler.Handle(
            new CreateSpriteWithFileCommand(
                new WebApi.Files.FormFileUpload(file),
                spriteName,
                type,
                categoryId,
                batchId),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/sprites/{result.Value.SpriteId}", result.Value);
    }

    private static async Task<IResult> UpdateSprite(
        int id,
        [FromBody] UpdateSpriteRequest request,
        ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateSpriteCommand(id, request.Name, request.SpriteType, request.CategoryId),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> DeleteSprite(
        int id,
        ICommandHandler<DeleteSpriteCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteSpriteCommand(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> SoftDeleteSprite(
        int id,
        ICommandHandler<SoftDeleteSpriteCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new SoftDeleteSpriteCommand(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateSpriteRequest(string Name, int FileId, SpriteType SpriteType, int? CategoryId = null);
public record UpdateSpriteRequest(string? Name, SpriteType? SpriteType, int? CategoryId);
