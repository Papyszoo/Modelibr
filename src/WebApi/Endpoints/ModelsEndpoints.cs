using Application.Abstractions.Messaging;
using Application.Models;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class ModelsEndpoints
{
    public static void MapModelsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/models", async (int? packId, int? projectId, IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllModelsQuery(packId, projectId), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value.Models);
        })
        .WithName("Get All Models");

        app.MapGet("/models/{id}", async (int id, IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetModelByIdQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value.Model);
        })
        .WithName("Get Model By Id");

        app.MapGet("/models/{id}/file", async (int id, IQueryHandler<GetModelFileQuery, GetModelFileQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetModelFileQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(result.Error.Message);
            }

            var fileStream = System.IO.File.OpenRead(result.Value.FullPath);
            var contentType = ContentTypeProvider.GetContentType(result.Value.OriginalFileName);
            
            return Results.File(fileStream, contentType, result.Value.OriginalFileName, enableRangeProcessing: true);
        })
        .WithName("Get Model File");

        app.MapPut("/models/{id}/defaultTextureSet", async (int id, int? textureSetId, int? modelVersionId, ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new SetDefaultTextureSetCommand(id, textureSetId, modelVersionId), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Set Default Texture Set");

        app.MapPost("/models/{id}/active-version/{versionId}", async (int id, int versionId, ICommandHandler<SetActiveVersionCommand> commandHandler) =>
        {
            var result = await commandHandler.Handle(new SetActiveVersionCommand(id, versionId), CancellationToken.None);
            
            if (!result.IsSuccess)
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
            
            if (!result.IsSuccess)
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
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Soft Delete Model Version")
        .WithTags("Models");
    }
}