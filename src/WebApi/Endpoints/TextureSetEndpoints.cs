using Application.Abstractions.Messaging;
using Application.TextureSets;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class TextureSetEndpoints
{
    public static void MapTextureSetEndpoints(this IEndpointRouteBuilder app)
    {
        // CRUD operations
        app.MapGet("/texture-sets", GetAllTextureSets)
            .WithName("Get All Texture Sets")
            .WithSummary("Gets all texture sets with their textures and model associations")
            .WithOpenApi();

        app.MapGet("/texture-sets/{id}", GetTextureSetById)
            .WithName("Get Texture Set By ID")
            .WithSummary("Gets a specific texture set by ID")
            .WithOpenApi();

        app.MapPost("/texture-sets", CreateTextureSet)
            .WithName("Create Texture Set")
            .WithSummary("Creates a new texture set")
            .WithOpenApi();

        app.MapPut("/texture-sets/{id}", UpdateTextureSet)
            .WithName("Update Texture Set")
            .WithSummary("Updates an existing texture set")
            .WithOpenApi();

        app.MapDelete("/texture-sets/{id}", DeleteTextureSet)
            .WithName("Delete Texture Set")
            .WithSummary("Deletes a texture set")
            .WithOpenApi();

        // Texture management
        app.MapPost("/texture-sets/{id}/textures", AddTextureToPackEndpoint)
            .WithName("Add Texture to Pack")
            .WithSummary("Adds a texture to the specified texture set")
            .WithOpenApi();

        app.MapDelete("/texture-sets/{packId}/textures/{textureId}", RemoveTextureFromPack)
            .WithName("Remove Texture from Pack")
            .WithSummary("Removes a texture from the specified texture set")
            .WithOpenApi();

        // Model association
        app.MapPost("/texture-sets/{packId}/models/{modelId}", AssociateTextureSetWithModel)
            .WithName("Associate Texture Set with Model")
            .WithSummary("Associates a texture set with a model")
            .WithOpenApi();

        app.MapDelete("/texture-sets/{packId}/models/{modelId}", DisassociateTextureSetFromModel)
            .WithName("Disassociate Texture Set from Model")
            .WithSummary("Removes the association between a texture set and a model")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllTextureSets(
        int? packId,
        IQueryHandler<GetAllTextureSetsQuery, GetAllTextureSetsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllTextureSetsQuery(packId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetTextureSetById(
        int id,
        IQueryHandler<GetTextureSetByIdQuery, GetTextureSetByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetTextureSetByIdQuery(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value.TextureSet);
    }

    private static async Task<IResult> CreateTextureSet(
        [FromBody] CreateTextureSetRequest request,
        ICommandHandler<CreateTextureSetCommand, CreateTextureSetResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Texture set name is required." });
        }

        var result = await commandHandler.Handle(new CreateTextureSetCommand(request.Name), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/texture-sets/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> UpdateTextureSet(
        int id,
        [FromBody] UpdateTextureSetRequest request,
        ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Texture set name is required." });
        }

        var result = await commandHandler.Handle(new UpdateTextureSetCommand(id, request.Name), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> DeleteTextureSet(
        int id,
        ICommandHandler<DeleteTextureSetCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteTextureSetCommand(id), cancellationToken);

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

    private static async Task<IResult> AssociateTextureSetWithModel(
        int packId,
        int modelId,
        ICommandHandler<AssociateTextureSetWithModelCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new AssociateTextureSetWithModelCommand(packId, modelId), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> DisassociateTextureSetFromModel(
        int packId,
        int modelId,
        ICommandHandler<DisassociateTextureSetFromModelCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new DisassociateTextureSetFromModelCommand(packId, modelId), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateTextureSetRequest(string Name);
public record UpdateTextureSetRequest(string Name);
public record AddTextureToPackRequest(int FileId, TextureType TextureType);