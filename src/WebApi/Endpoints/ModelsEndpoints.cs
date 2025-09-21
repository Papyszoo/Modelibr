using Application.Abstractions.Messaging;
using Application.Models;

namespace WebApi.Endpoints;

public static class ModelsEndpoints
{
    public static void MapModelsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/models", async (IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllModelsQuery(), CancellationToken.None);
            
            return Results.Ok(result);
        })
        .WithName("Get All Models");
    }
}