using Application.Abstractions.Messaging;
using Application.Stages;
using SharedKernel;

namespace WebApi.Endpoints;

public static class StageEndpoints
{
    public static void MapStageEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/stages", async (IQueryHandler<GetAllStagesQuery, GetAllStagesResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllStagesQuery(), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get All Stages")
        .WithSummary("Get all saved stages");

        app.MapGet("/stages/{id}", async (int id, IQueryHandler<GetStageByIdQuery, GetStageByIdResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetStageByIdQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get Stage By Id")
        .WithSummary("Get a specific stage by ID");

        app.MapPost("/stages", async (CreateStageRequest request, ICommandHandler<CreateStageCommand, CreateStageResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(
                new CreateStageCommand(request.Name, request.ConfigurationJson), 
                CancellationToken.None
            );
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Created($"/stages/{result.Value.Id}", result.Value);
        })
        .WithName("Create Stage")
        .WithSummary("Create a new stage");

        app.MapPut("/stages/{id}", async (int id, UpdateStageRequest request, ICommandHandler<UpdateStageCommand, UpdateStageResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(
                new UpdateStageCommand(id, request.ConfigurationJson), 
                CancellationToken.None
            );
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Update Stage")
        .WithSummary("Update an existing stage");

        app.MapDelete("/stages/{id}", async (int id, ICommandHandler<DeleteStageCommand, DeleteStageResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new DeleteStageCommand(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Delete Stage")
        .WithSummary("Delete a stage");
    }
}

public record CreateStageRequest(string Name, string ConfigurationJson);
public record UpdateStageRequest(string ConfigurationJson);
