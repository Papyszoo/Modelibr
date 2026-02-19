using Application.Abstractions.Messaging;
using Application.TextureSets;
using Application.Thumbnails;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;
using WebApi.Files;
using WebApi.Infrastructure;
using WebApi.Services;

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
        app.MapPost("/texture-sets/{id}/textures", AddTextureToTextureSetEndpoint)
            .WithName("Add Texture to Texture Set")
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

        // Kind update
        app.MapPut("/texture-sets/{id}/kind", UpdateTextureSetKind)
            .WithName("Update Texture Set Kind")
            .WithSummary("Updates the kind of a texture set (ModelSpecific or Universal)")
            .WithOpenApi();

        // Tiling scale (Universal texture sets only)
        app.MapPut("/texture-sets/{id}/tiling-scale", UpdateTilingScale)
            .WithName("Update Texture Set Tiling Scale")
            .WithSummary("Updates the tiling scale for a universal texture set")
            .WithOpenApi();

        // Thumbnail endpoints
        app.MapPost("/texture-sets/{id}/thumbnail/upload", UploadTextureSetThumbnail)
            .WithName("Upload Texture Set Thumbnail")
            .WithTags("Thumbnails")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .DisableAntiforgery();

        app.MapPost("/texture-sets/{id}/thumbnail/png-upload", UploadTextureSetPngThumbnail)
            .WithName("Upload Texture Set PNG Thumbnail")
            .WithTags("Thumbnails")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .DisableAntiforgery();

        app.MapGet("/texture-sets/{id}/thumbnail/file", ServeTextureSetThumbnail)
            .WithName("Serve Texture Set Thumbnail")
            .WithTags("Thumbnails");

        app.MapGet("/texture-sets/{id}/thumbnail/png-file", ServeTextureSetPngThumbnail)
            .WithName("Serve Texture Set PNG Thumbnail")
            .WithTags("Thumbnails");

        app.MapPost("/texture-sets/{id}/thumbnail/regenerate", RegenerateTextureSetThumbnail)
            .WithName("Regenerate Texture Set Thumbnail")
            .WithTags("Thumbnails");
    }

    private static async Task<IResult> GetAllTextureSets(
        int? packId,
        int? projectId,
        int? page,
        int? pageSize,
        int? kind,
        IQueryHandler<GetAllTextureSetsQuery, GetAllTextureSetsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        TextureSetKind? textureSetKind = kind.HasValue ? (TextureSetKind)kind.Value : null;
        var result = await queryHandler.Handle(new GetAllTextureSetsQuery(packId, projectId, page, pageSize, textureSetKind), cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        // When paginated, include pagination metadata
        if (page.HasValue && pageSize.HasValue)
        {
            return Results.Ok(new
            {
                textureSets = result.Value.TextureSets,
                totalCount = result.Value.TotalCount,
                page = result.Value.Page,
                pageSize = result.Value.PageSize,
                totalPages = result.Value.TotalPages
            });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetTextureSetById(
        int id,
        IQueryHandler<GetTextureSetByIdQuery, GetTextureSetByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetTextureSetByIdQuery(id), cancellationToken);

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        var result = await commandHandler.Handle(new CreateTextureSetCommand(request.Name, request.Kind ?? TextureSetKind.ModelSpecific), cancellationToken);

        if (result.IsFailure)
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
        int? kind,
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
        var textureSetKind = kind.HasValue ? (TextureSetKind)kind.Value : TextureSetKind.ModelSpecific;

        var result = await commandHandler.Handle(
            new CreateTextureSetWithFileCommand(
                new WebApi.Files.FormFileUpload(file),
                textureSetName,
                texType,
                batchId,
                textureSetKind),
            cancellationToken);

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> AddTextureToTextureSetEndpoint(
        int id,
        [FromBody] AddTextureToTextureSetRequest request,
        ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new AddTextureToTextureSetCommand(id, request.FileId, request.TextureType, request.SourceChannel), 
            cancellationToken);

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        if (result.IsFailure)
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

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> UpdateTextureSetKind(
        int id,
        [FromBody] UpdateTextureSetKindRequest request,
        ICommandHandler<UpdateTextureSetKindCommand, UpdateTextureSetKindResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateTextureSetKindCommand(id, request.Kind),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> UpdateTilingScale(
        int id,
        [FromBody] UpdateTilingScaleRequest request,
        ICommandHandler<UpdateTextureSetTilingScaleCommand, UpdateTextureSetTilingScaleResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateTextureSetTilingScaleCommand(id, request.TilingScaleX, request.TilingScaleY, request.UvMappingMode, request.UvScale),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> UploadTextureSetThumbnail(
        int id,
        IFormFile file,
        ICommandHandler<UploadTextureSetThumbnailCommand, UploadTextureSetThumbnailCommandResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new UploadTextureSetThumbnailCommand(id, new FormFileUpload(file), false);
        var result = await commandHandler.Handle(command, cancellationToken);

        if (result.IsFailure)
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });

        return Results.Ok(new { Message = "Texture set thumbnail uploaded", TextureSetId = id, result.Value.ThumbnailPath });
    }

    private static async Task<IResult> UploadTextureSetPngThumbnail(
        int id,
        IFormFile file,
        ICommandHandler<UploadTextureSetThumbnailCommand, UploadTextureSetThumbnailCommandResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new UploadTextureSetThumbnailCommand(id, new FormFileUpload(file), true);
        var result = await commandHandler.Handle(command, cancellationToken);

        if (result.IsFailure)
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });

        return Results.Ok(new { Message = "Texture set PNG thumbnail uploaded", TextureSetId = id, result.Value.ThumbnailPath });
    }

    private static async Task<IResult> ServeTextureSetThumbnail(
        int id,
        IQueryHandler<GetTextureSetByIdQuery, GetTextureSetByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetTextureSetByIdQuery(id), cancellationToken);
        if (result.IsFailure)
            return Results.NotFound();

        var thumbnailPath = result.Value.TextureSet.ThumbnailPath;
        if (string.IsNullOrEmpty(thumbnailPath) || !System.IO.File.Exists(thumbnailPath))
            return Results.NotFound();

        var contentType = ContentTypeProvider.GetContentType(thumbnailPath);
        return Results.File(thumbnailPath, contentType);
    }

    private static async Task<IResult> ServeTextureSetPngThumbnail(
        int id,
        IQueryHandler<GetTextureSetByIdQuery, GetTextureSetByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetTextureSetByIdQuery(id), cancellationToken);
        if (result.IsFailure)
            return Results.NotFound();

        var pngPath = result.Value.TextureSet.PngThumbnailPath;
        if (string.IsNullOrEmpty(pngPath) || !System.IO.File.Exists(pngPath))
            return Results.NotFound();

        return Results.File(pngPath, "image/png");
    }

    private static async Task<IResult> RegenerateTextureSetThumbnail(
        int id,
        ICommandHandler<RegenerateTextureSetThumbnailCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new RegenerateTextureSetThumbnailCommand(id), cancellationToken);

        if (result.IsFailure)
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });

        return Results.Ok(new { Message = "Texture set thumbnail regeneration queued", TextureSetId = id });
    }
}

// Request DTOs
public record CreateTextureSetRequest(string Name, TextureSetKind? Kind = null);
public record UpdateTextureSetRequest(string Name);
public record UpdateTextureSetKindRequest(TextureSetKind Kind);
public record UpdateTilingScaleRequest(float TilingScaleX, float TilingScaleY, UvMappingMode? UvMappingMode = null, float? UvScale = null);
public record AddTextureToTextureSetRequest(int FileId, TextureType TextureType, TextureChannel? SourceChannel = null);
public record ChangeTextureTypeRequest(TextureType TextureType);
public record ChangeTextureChannelRequest(TextureChannel SourceChannel);