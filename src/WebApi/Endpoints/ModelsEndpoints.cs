using Application.Abstractions.Messaging;
using Application.Models;
using Domain.ValueObjects;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class ModelsEndpoints
{
    public static void MapModelsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/models", async (int? packId, PolyCount? polyCount, IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllModelsQuery(packId, polyCount), CancellationToken.None);
            
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

        app.MapPut("/models/{id}/defaultTextureSet", async (int id, int? textureSetId, ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new SetDefaultTextureSetCommand(id, textureSetId), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Set Default Texture Set");
    }
}