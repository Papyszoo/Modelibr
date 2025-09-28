using Application.Abstractions.Messaging;
using Application.TexturePacks;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class TexturePackEndpoints
{
    public static void MapTexturePackEndpoints(this IEndpointRouteBuilder app)
    {
        // CRUD operations
        app.MapGet("/texture-packs", GetAllTexturePacks)
            .WithName("Get All Texture Packs")
            .WithSummary("Gets all texture packs with their textures and model associations")
            .WithOpenApi();

        app.MapGet("/texture-packs/{id}", GetTexturePackById)
            .WithName("Get Texture Pack By ID")
            .WithSummary("Gets a specific texture pack by ID")
            .WithOpenApi();

        app.MapPost("/texture-packs", CreateTexturePack)
            .WithName("Create Texture Pack")
            .WithSummary("Creates a new texture pack")
            .WithOpenApi();

        app.MapPut("/texture-packs/{id}", UpdateTexturePack)
            .WithName("Update Texture Pack")
            .WithSummary("Updates an existing texture pack")
            .WithOpenApi();

        app.MapDelete("/texture-packs/{id}", DeleteTexturePack)
            .WithName("Delete Texture Pack")
            .WithSummary("Deletes a texture pack")
            .WithOpenApi();

        // Texture management
        app.MapPost("/texture-packs/{id}/textures", AddTextureToPackEndpoint)
            .WithName("Add Texture to Pack")
            .WithSummary("Adds a texture to the specified texture pack")
            .WithOpenApi();

        app.MapDelete("/texture-packs/{packId}/textures/{textureId}", RemoveTextureFromPack)
            .WithName("Remove Texture from Pack")
            .WithSummary("Removes a texture from the specified texture pack")
            .WithOpenApi();

        // Model association
        app.MapPost("/texture-packs/{packId}/models/{modelId}", AssociateTexturePackWithModel)
            .WithName("Associate Texture Pack with Model")
            .WithSummary("Associates a texture pack with a model")
            .WithOpenApi();

        app.MapDelete("/texture-packs/{packId}/models/{modelId}", DisassociateTexturePackFromModel)
            .WithName("Disassociate Texture Pack from Model")
            .WithSummary("Removes the association between a texture pack and a model")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllTexturePacks(
        IQueryHandler<GetAllTexturePacksQuery, GetAllTexturePacksResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllTexturePacksQuery(), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetTexturePackById(
        int id,
        IQueryHandler<GetTexturePackByIdQuery, GetTexturePackByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetTexturePackByIdQuery(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value.TexturePack);
    }

    private static async Task<IResult> CreateTexturePack(
        [FromBody] CreateTexturePackRequest request,
        ICommandHandler<CreateTexturePackCommand, CreateTexturePackResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Texture pack name is required." });
        }

        var result = await commandHandler.Handle(new CreateTexturePackCommand(request.Name), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/texture-packs/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> UpdateTexturePack(
        int id,
        [FromBody] UpdateTexturePackRequest request,
        ICommandHandler<UpdateTexturePackCommand, UpdateTexturePackResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Texture pack name is required." });
        }

        var result = await commandHandler.Handle(new UpdateTexturePackCommand(id, request.Name), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> DeleteTexturePack(
        int id,
        ICommandHandler<DeleteTexturePackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteTexturePackCommand(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> AddTextureToPackEndpoint(
        int id,
        [FromBody] AddTextureToPackRequest request,
        ICommandHandler<AddTextureToPackCommand, AddTextureToPackResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new AddTextureToPackCommand(id, request.FileId, request.TextureType), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> RemoveTextureFromPack(
        int packId,
        int textureId,
        ICommandHandler<RemoveTextureFromPackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new RemoveTextureFromPackCommand(packId, textureId), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> AssociateTexturePackWithModel(
        int packId,
        int modelId,
        ICommandHandler<AssociateTexturePackWithModelCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new AssociateTexturePackWithModelCommand(packId, modelId), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> DisassociateTexturePackFromModel(
        int packId,
        int modelId,
        ICommandHandler<DisassociateTexturePackFromModelCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new DisassociateTexturePackFromModelCommand(packId, modelId), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateTexturePackRequest(string Name);
public record UpdateTexturePackRequest(string Name);
public record AddTextureToPackRequest(int FileId, TextureType TextureType);