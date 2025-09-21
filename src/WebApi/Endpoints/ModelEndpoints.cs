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
        CancellationToken cancellationToken)
    {
        var validationResult = ValidateFile(file);
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
        CancellationToken cancellationToken)
    {
        var validationResult = ValidateFile(file);
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

    private static Result ValidateFile(IFormFile file)
    {
        if (file.Length <= 0)
        {
            return Result.Failure(new Error("InvalidFile", "File is empty or invalid."));
        }

        if (file.Length > 1_073_741_824) // 1GB
        {
            return Result.Failure(new Error("FileTooLarge", "File size cannot exceed 1GB."));
        }

        return Result.Success();
    }
}