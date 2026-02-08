using Application.Abstractions.Messaging;
using Application.Models;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;
using WebApi.Files;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class ModelEndpoints
{
    public static void MapModelEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/models", CreateModel)
        .WithName("Create Model")
        .DisableAntiforgery();

        app.MapPost("/models/{modelId}/files", AddFileToModel)
        .WithName("Add File to Model")
        .DisableAntiforgery();

        app.MapPost("/models/{modelId}/tags", UpdateModelTags)
        .WithName("Update Model Tags")
        .WithTags("Models");

        app.MapGet("/models", async (int? packId, int? projectId, IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse> queryHandler, CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetAllModelsQuery(packId, projectId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value.Models);
        })
        .WithName("Get All Models");

        app.MapGet("/models/{id}", async (int id, IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> queryHandler, CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetModelByIdQuery(id), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value.Model);
        })
        .WithName("Get Model By Id");

        app.MapGet("/models/{id}/file", async (int id, IQueryHandler<GetModelFileQuery, GetModelFileQueryResponse> queryHandler, CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetModelFileQuery(id), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var fileStream = System.IO.File.OpenRead(result.Value.FullPath);
            var contentType = ContentTypeProvider.GetContentType(result.Value.OriginalFileName);
            
            return Results.File(fileStream, contentType, result.Value.OriginalFileName, enableRangeProcessing: true);
        })
        .WithName("Get Model File");

        app.MapPut("/models/{id}/default-texture-set", async (int id, SetDefaultTextureSetRequest request, ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse> commandHandler, CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new SetDefaultTextureSetCommand(id, request.TextureSetId, request.ModelVersionId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Set Default Texture Set");

        app.MapPost("/models/{id}/active-version/{versionId}", async (int id, int versionId, ICommandHandler<SetActiveVersionCommand> commandHandler, CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new SetActiveVersionCommand(id, versionId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok();
        })
        .WithName("Set Active Version");

        app.MapDelete("/models/{id}", async (
            int id,
            ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new SoftDeleteModelCommand(id), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Soft Delete Model")
        .WithTags("Models");

        app.MapDelete("/models/{modelId}/versions/{versionId}", async (
            int modelId,
            int versionId,
            ICommandHandler<SoftDeleteModelVersionCommand, SoftDeleteModelVersionResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new SoftDeleteModelVersionCommand(modelId, versionId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Soft Delete Model Version")
        .WithTags("Models");
    }

    private static async Task<IResult> CreateModel(
        IFormFile file,
        string? batchId,
        ICommandHandler<AddModelCommand, AddModelCommandResponse> commandHandler,
        Application.Settings.ISettingsService settingsService,
        CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetSettingsAsync(cancellationToken);
        var validationResult = ValidateFile(file, settings.MaxFileSizeBytes);
        if (validationResult.IsFailure)
        {
            return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
        }

        var result = await commandHandler.Handle(
            new AddModelCommand(new FormFileUpload(file), BatchId: batchId),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> AddFileToModel(
        int modelId,
        IFormFile file, 
        ICommandHandler<AddFileToModelCommand, AddFileToModelCommandResponse> commandHandler,
        Application.Settings.ISettingsService settingsService,
        CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetSettingsAsync(cancellationToken);
        var validationResult = ValidateFile(file, settings.MaxFileSizeBytes);
        if (validationResult.IsFailure)
        {
            return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
        }

        var result = await commandHandler.Handle(new AddFileToModelCommand(modelId, new FormFileUpload(file)), cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static Result ValidateFile(IFormFile file, long maxFileSizeBytes)
    {
        if (file.Length <= 0)
        {
            return Result.Failure(new Error("InvalidFile", "File is empty or invalid."));
        }

        if (file.Length > maxFileSizeBytes)
        {
            var maxSizeMB = maxFileSizeBytes / 1_048_576;
            return Result.Failure(new Error("FileTooLarge", $"File size cannot exceed {maxSizeMB}MB."));
        }

        return Result.Success();
    }

    private static async Task<IResult> UpdateModelTags(
        int modelId,
        UpdateModelTagsRequest request,
        ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new UpdateModelTagsCommand(
            modelId,
            request.Tags,
            request.Description
        );

        var result = await commandHandler.Handle(command, cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }
}

public record UpdateModelTagsRequest(string? Tags, string? Description);
public record SetDefaultTextureSetRequest(int? TextureSetId, int? ModelVersionId);