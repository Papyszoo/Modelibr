using Application.Abstractions.Messaging;
using Application.Models;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;
using WebApi.Files;

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
    }

    private static async Task<IResult> CreateModel(
        IFormFile file, 
        ICommandHandler<AddModelCommand, AddModelCommandResponse> commandHandler,
        Application.Settings.ISettingsService settingsService,
        CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetSettingsAsync(cancellationToken);
        var validationResult = ValidateFile(file, settings.MaxFileSizeBytes);
        if (!validationResult.IsSuccess)
        {
            return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
        }

        var result = await commandHandler.Handle(new AddModelCommand(new FormFileUpload(file)), cancellationToken);

        if (!result.IsSuccess)
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
        if (!validationResult.IsSuccess)
        {
            return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
        }

        var result = await commandHandler.Handle(new AddFileToModelCommand(modelId, new FormFileUpload(file)), cancellationToken);

        if (!result.IsSuccess)
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
}