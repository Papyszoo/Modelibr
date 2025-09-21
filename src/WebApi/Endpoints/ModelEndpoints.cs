using Application.Abstractions.Messaging;
using Application.Models;
using WebApi.Files;

namespace WebApi.Endpoints;

public static class ModelEndpoints
{
    public static void MapModelEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/models", async (IFormFile file, ICommandHandler<AddModelCommand, AddModelCommandResponse> commandHandler) =>
        {
            if (file.Length > 0)
            {
                var result = await commandHandler.Handle(new AddModelCommand(new FormFileUpload(file)), CancellationToken.None);

                return Results.Ok(result);
            }
            return Results.BadRequest("Invalid file.");
        })
        .WithName("Create Model")
        .DisableAntiforgery();

        app.MapPost("/models/{modelId}/files", async (int modelId, IFormFile file, ICommandHandler<AddFileToModelCommand, AddFileToModelCommandResponse> commandHandler) =>
        {
            if (file.Length > 0)
            {
                var result = await commandHandler.Handle(new AddFileToModelCommand(modelId, new FormFileUpload(file)), CancellationToken.None);

                return Results.Ok(result);
            }
            return Results.BadRequest("Invalid file.");
        })
        .WithName("Add File to Model")
        .DisableAntiforgery();
    }
}