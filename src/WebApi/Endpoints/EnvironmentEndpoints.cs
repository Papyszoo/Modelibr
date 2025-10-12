using Application.Abstractions.Messaging;
using Application.Environments;
using SharedKernel;

namespace WebApi.Endpoints;

public static class EnvironmentEndpoints
{
    public static void MapEnvironmentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/environments", async (IQueryHandler<GetAllEnvironmentsQuery, GetAllEnvironmentsResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllEnvironmentsQuery(), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get All Environments")
        .WithSummary("Get all saved environments");

        app.MapGet("/environments/{id}", async (int id, IQueryHandler<GetEnvironmentByIdQuery, GetEnvironmentByIdResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetEnvironmentByIdQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get Environment By Id")
        .WithSummary("Get a specific environment by ID");

        app.MapPost("/environments", async (CreateEnvironmentRequest request, ICommandHandler<CreateEnvironmentCommand, CreateEnvironmentResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(
                new CreateEnvironmentCommand(request.Name, request.ConfigurationJson), 
                CancellationToken.None
            );
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Created($"/environments/{result.Value.Id}", result.Value);
        })
        .WithName("Create Environment")
        .WithSummary("Create a new environment");

        app.MapPut("/environments/{id}", async (int id, UpdateEnvironmentRequest request, ICommandHandler<UpdateEnvironmentCommand, UpdateEnvironmentResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(
                new UpdateEnvironmentCommand(id, request.ConfigurationJson), 
                CancellationToken.None
            );
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Update Environment")
        .WithSummary("Update an existing environment");
    }
}

public record CreateEnvironmentRequest(string Name, string ConfigurationJson);
public record UpdateEnvironmentRequest(string ConfigurationJson);
