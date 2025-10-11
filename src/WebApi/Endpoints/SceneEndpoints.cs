using Application.Abstractions.Messaging;
using Application.Scenes;
using SharedKernel;

namespace WebApi.Endpoints;

public static class SceneEndpoints
{
    public static void MapSceneEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/scenes", async (IQueryHandler<GetAllScenesQuery, GetAllScenesResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllScenesQuery(), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get All Scenes")
        .WithSummary("Get all saved scenes");

        app.MapGet("/scenes/{id}", async (int id, IQueryHandler<GetSceneByIdQuery, GetSceneByIdResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetSceneByIdQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get Scene By Id")
        .WithSummary("Get a specific scene by ID");

        app.MapPost("/scenes", async (CreateSceneRequest request, ICommandHandler<CreateSceneCommand, CreateSceneResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(
                new CreateSceneCommand(request.Name, request.ConfigurationJson), 
                CancellationToken.None
            );
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Created($"/scenes/{result.Value.Id}", result.Value);
        })
        .WithName("Create Scene")
        .WithSummary("Create a new scene");

        app.MapPut("/scenes/{id}", async (int id, UpdateSceneRequest request, ICommandHandler<UpdateSceneCommand, UpdateSceneResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(
                new UpdateSceneCommand(id, request.ConfigurationJson), 
                CancellationToken.None
            );
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Update Scene")
        .WithSummary("Update an existing scene");
    }
}

public record CreateSceneRequest(string Name, string ConfigurationJson);
public record UpdateSceneRequest(string ConfigurationJson);
