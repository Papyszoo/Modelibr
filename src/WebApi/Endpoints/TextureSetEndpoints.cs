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

        app.MapGet("/texture-sets/by-file/{fileId}", GetTextureSetByFileId)
            .WithName("Get Texture Set By File ID")
            .WithSummary("Gets a texture set that contains the specified file")
            .WithOpenApi();

        app.MapPost("/texture-sets", CreateTextureSet)
            .WithName("Create Texture Set")
            .WithSummary("Creates a new texture set")
            .WithOpenApi();

        app.MapPost("/texture-sets/with-file", CreateTextureSetWithFile)
            .WithName("Create Texture Set With File")
            .WithSummary("Creates a new texture set and uploads a texture file in one operation")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapPut("/texture-sets/{id}", UpdateTextureSet)
            .WithName("Update Texture Set")
            .WithSummary("Updates an existing texture set")
            .WithOpenApi();

        app.MapDelete("/texture-sets/{id}", DeleteTextureSet)
            .WithName("Delete Texture Set")
            .WithSummary("Deletes a texture set")
            .WithOpenApi();

        app.MapDelete("/texture-sets/{id}/hard", HardDeleteTextureSet)
            .WithName("Hard Delete Texture Set")
            .WithSummary("Hard deletes a texture set but keeps the underlying files")
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

        app.MapPut("/texture-sets/{setId}/textures/{textureId}/type", ChangeTextureType)
            .WithName("Change Texture Type")
            .WithSummary("Changes the texture type of an existing texture in a set")
            .WithOpenApi();

        app.MapPut("/texture-sets/{setId}/textures/{textureId}/channel", ChangeTextureChannel)
            .WithName("Change Texture Channel")
            .WithSummary("Changes the source channel of an existing texture in a set")
            .WithOpenApi();


        // Model version association
        app.MapPost("/texture-sets/{packId}/model-versions/{modelVersionId}", AssociateTextureSetWithModelVersion)
            .WithName("Associate Texture Set with Model Version")
            .WithSummary("Associates a texture set with a specific model version")
            .WithOpenApi();

        app.MapDelete("/texture-sets/{packId}/model-versions/{modelVersionId}", DisassociateTextureSetFromModelVersion)
            .WithName("Disassociate Texture Set from Model Version")
            .WithSummary("Removes the association between a texture set and a model version")
            .WithOpenApi();
        
        // Legacy: Associate with all versions of a model (uses active version as starting point)
        app.MapPost("/texture-sets/{packId}/models/{modelId}/all-versions", AssociateTextureSetWithAllModelVersions)
            .WithName("Associate Texture Set with All Model Versions")
            .WithSummary("Associates a texture set with all versions of a model")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllTextureSets(
        int? packId,
        int? projectId,
        IQueryHandler<GetAllTextureSetsQuery, GetAllTextureSetsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllTextureSetsQuery(packId, projectId), cancellationToken);

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

    private static async Task<IResult> GetTextureSetByFileId(
        int fileId,
        IQueryHandler<GetTextureSetByFileIdQuery, GetTextureSetByFileIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetTextureSetByFileIdQuery(fileId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
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

    private static async Task<IResult> CreateTextureSetWithFile(
        IFormFile file,
        string? name,
        TextureType? textureType,
        string? batchId,
        ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "File is required." });
        }

        // Use file name without extension as default texture set name
        var textureSetName = name ?? Path.GetFileNameWithoutExtension(file.FileName);   
        var texType = textureType ?? TextureType.Albedo;

        var result = await commandHandler.Handle(
            new CreateTextureSetWithFileCommand(
                new WebApi.Files.FormFileUpload(file),
                textureSetName,
                texType,
                batchId),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/texture-sets/{result.Value.TextureSetId}", result.Value);
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

    private static async Task<IResult> HardDeleteTextureSet(
        int id,
        ICommandHandler<HardDeleteTextureSetCommand, HardDeleteTextureSetResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new HardDeleteTextureSetCommand(id), cancellationToken);

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
            new AddTextureToPackCommand(id, request.FileId, request.TextureType, request.SourceChannel), 
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

    private static async Task<IResult> ChangeTextureType(
        int setId,
        int textureId,
        [FromBody] ChangeTextureTypeRequest request,
        ICommandHandler<ChangeTextureTypeCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new ChangeTextureTypeCommand(setId, textureId, request.TextureType),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> ChangeTextureChannel(
        int setId,
        int textureId,
        [FromBody] ChangeTextureChannelRequest request,
        ICommandHandler<UpdateTextureChannelCommand, UpdateTextureChannelResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateTextureChannelCommand(setId, textureId, request.SourceChannel),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }


    private static async Task<IResult> AssociateTextureSetWithModelVersion(
        int packId,
        int modelVersionId,
        ICommandHandler<AssociateTextureSetWithModelVersionCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new AssociateTextureSetWithModelVersionCommand(packId, modelVersionId), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> DisassociateTextureSetFromModelVersion(
        int packId,
        int modelVersionId,
        ICommandHandler<DisassociateTextureSetFromModelVersionCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new DisassociateTextureSetFromModelVersionCommand(packId, modelVersionId), 
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> AssociateTextureSetWithAllModelVersions(
        int packId,
        int modelId,
        ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new AssociateTextureSetWithAllModelVersionsCommand(packId, modelId), 
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
public record AddTextureToPackRequest(int FileId, TextureType TextureType, TextureChannel? SourceChannel = null);
public record ChangeTextureTypeRequest(TextureType TextureType);
public record ChangeTextureChannelRequest(TextureChannel SourceChannel);