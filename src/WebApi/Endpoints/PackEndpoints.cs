using Application.Abstractions.Messaging;
using Application.Packs;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class PackEndpoints
{
    public static void MapPackEndpoints(this IEndpointRouteBuilder app)
    {
        // Pack CRUD
        app.MapGet("/packs", GetAllPacks)
            .WithName("Get All Packs")
            .WithSummary("Retrieves all packs")
            .WithOpenApi();

        app.MapGet("/packs/{id}", GetPackById)
            .WithName("Get Pack by ID")
            .WithSummary("Retrieves a pack by its ID")
            .WithOpenApi();

        app.MapPost("/packs", CreatePack)
            .WithName("Create Pack")
            .WithSummary("Creates a new pack")
            .WithOpenApi();

        app.MapPut("/packs/{id}", UpdatePack)
            .WithName("Update Pack")
            .WithSummary("Updates an existing pack")
            .WithOpenApi();

        app.MapDelete("/packs/{id}", DeletePack)
            .WithName("Delete Pack")
            .WithSummary("Deletes a pack")
            .WithOpenApi();

        // Pack-Model association
        app.MapPost("/packs/{packId}/models/{modelId}", AddModelToPack)
            .WithName("Add Model to Pack")
            .WithSummary("Adds a model to the specified pack")
            .WithOpenApi();

        app.MapDelete("/packs/{packId}/models/{modelId}", RemoveModelFromPack)
            .WithName("Remove Model from Pack")
            .WithSummary("Removes a model from the specified pack")
            .WithOpenApi();

        // Pack-TextureSet association
        app.MapPost("/packs/{packId}/texture-sets/{textureSetId}", AddTextureSetToPack)
            .WithName("Add Texture Set to Pack")
            .WithSummary("Adds a texture set to the specified pack")
            .WithOpenApi();

        app.MapPost("/packs/{packId}/textures/with-file", AddTextureToPackWithFile)
            .WithName("Add Texture to Pack with File")
            .WithSummary("Uploads a file, creates a texture set, and adds it to the pack in one operation")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapDelete("/packs/{packId}/texture-sets/{textureSetId}", RemoveTextureSetFromPack)
            .WithName("Remove Texture Set from Pack")
            .WithSummary("Removes a texture set from the specified pack")
            .WithOpenApi();

        // Pack-Sprite association
        app.MapPost("/packs/{packId}/sprites/{spriteId}", AddSpriteToPack)
            .WithName("Add Sprite to Pack")
            .WithSummary("Adds a sprite to the specified pack")
            .WithOpenApi();

        app.MapDelete("/packs/{packId}/sprites/{spriteId}", RemoveSpriteFromPack)
            .WithName("Remove Sprite from Pack")
            .WithSummary("Removes a sprite from the specified pack")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllPacks(
        IQueryHandler<GetAllPacksQuery, GetAllPacksResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var query = new GetAllPacksQuery();
        var result = await queryHandler.Handle(query, cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> GetPackById(
        int id,
        IQueryHandler<GetPackByIdQuery, PackDetailDto> queryHandler,
        CancellationToken cancellationToken)
    {
        var query = new GetPackByIdQuery(id);
        var result = await queryHandler.Handle(query, cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.NotFound(result.Error);
    }

    private static async Task<IResult> CreatePack(
        [FromBody] CreatePackRequest request,
        ICommandHandler<CreatePackCommand, CreatePackResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new CreatePackCommand(request.Name, request.Description);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/packs/{result.Value.Id}", result.Value)
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> UpdatePack(
        int id,
        [FromBody] UpdatePackRequest request,
        ICommandHandler<UpdatePackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new UpdatePackCommand(id, request.Name, request.Description);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> DeletePack(
        int id,
        ICommandHandler<DeletePackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new DeletePackCommand(id);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.NotFound(result.Error);
    }

    private static async Task<IResult> AddModelToPack(
        int packId,
        int modelId,
        ICommandHandler<AddModelToPackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new AddModelToPackCommand(packId, modelId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> RemoveModelFromPack(
        int packId,
        int modelId,
        ICommandHandler<RemoveModelFromPackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new RemoveModelFromPackCommand(packId, modelId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> AddTextureSetToPack(
        int packId,
        int textureSetId,
        ICommandHandler<AddTextureSetToPackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new AddTextureSetToPackCommand(packId, textureSetId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> RemoveTextureSetFromPack(
        int packId,
        int textureSetId,
        ICommandHandler<RemoveTextureSetFromPackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new RemoveTextureSetFromPackCommand(packId, textureSetId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> AddTextureToPackWithFile(
        int packId,
        [FromForm] IFormFile file,
        [FromForm] string name,
        [FromForm] int textureType,
        [FromQuery] string? batchId,
        [FromQuery] string? uploadType,
        ICommandHandler<AddTextureToPackWithFileCommand, int> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new AddTextureToPackWithFileCommand(
            packId,
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

    private static async Task<IResult> AddSpriteToPack(
        int packId,
        int spriteId,
        ICommandHandler<AddSpriteToPackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new AddSpriteToPackCommand(packId, spriteId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }

    private static async Task<IResult> RemoveSpriteFromPack(
        int packId,
        int spriteId,
        ICommandHandler<RemoveSpriteFromPackCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new RemoveSpriteFromPackCommand(packId, spriteId);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(result.Error);
    }
}

// Request DTOs
public record CreatePackRequest(string Name, string? Description);
public record UpdatePackRequest(string Name, string? Description);
