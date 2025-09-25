using Application.Abstractions.Messaging;
using Application.Models;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class ModelsEndpoints
{
    public static void MapModelsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/models", async (IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllModelsQuery(), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value.Models);
        })
        .WithName("Get All Models");

        app.MapGet("/models/{id}/file", async (int id, IQueryHandler<GetModelFileQuery, GetModelFileQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetModelFileQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(result.Error.Message);
            }

            var fileStream = System.IO.File.OpenRead(result.Value.FilePath);
            var contentType = ContentTypeProvider.GetContentType(result.Value.OriginalFileName);
            
            return Results.File(fileStream, contentType, result.Value.OriginalFileName, enableRangeProcessing: true);
        })
        .WithName("Get Model File");
    }
}