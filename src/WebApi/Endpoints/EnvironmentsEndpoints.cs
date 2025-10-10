using Application.Abstractions.Messaging;
using Application.Environments;

namespace WebApi.Endpoints;

public static class EnvironmentsEndpoints
{
    public static void MapEnvironmentsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/environments", async (
            IQueryHandler<GetAllEnvironmentsQuery, GetAllEnvironmentsResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllEnvironmentsQuery(), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value.Environments);
        })
        .WithName("Get All Environments")
        .WithTags("Environments");

        app.MapGet("/environments/{id}", async (
            int id,
            IQueryHandler<GetEnvironmentByIdQuery, GetEnvironmentByIdResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetEnvironmentByIdQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value.Environment);
        })
        .WithName("Get Environment By Id")
        .WithTags("Environments");

        app.MapPost("/environments", async (
            CreateEnvironmentRequest request,
            ICommandHandler<CreateEnvironmentCommand, CreateEnvironmentResponse> commandHandler) =>
        {
            var command = new CreateEnvironmentCommand(
                request.Name,
                request.LightIntensity,
                request.EnvironmentPreset,
                request.ShowShadows,
                request.IsDefault,
                request.Description
            );

            var result = await commandHandler.Handle(command, CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Created($"/environments/{result.Value.Id}", result.Value);
        })
        .WithName("Create Environment")
        .WithTags("Environments");

        app.MapPut("/environments/{id}", async (
            int id,
            UpdateEnvironmentRequest request,
            ICommandHandler<UpdateEnvironmentCommand, UpdateEnvironmentResponse> commandHandler) =>
        {
            var command = new UpdateEnvironmentCommand(
                id,
                request.Name,
                request.Description,
                request.LightIntensity,
                request.EnvironmentPreset,
                request.ShowShadows,
                request.ShadowType,
                request.ShadowOpacity,
                request.ShadowBlur
            );

            var result = await commandHandler.Handle(command, CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Update Environment")
        .WithTags("Environments");

        app.MapPost("/environments/{id}/set-default", async (
            int id,
            ICommandHandler<SetDefaultEnvironmentCommand, SetDefaultEnvironmentResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new SetDefaultEnvironmentCommand(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Set Default Environment")
        .WithTags("Environments");

        app.MapDelete("/environments/{id}", async (
            int id,
            ICommandHandler<DeleteEnvironmentCommand, DeleteEnvironmentResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new DeleteEnvironmentCommand(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.NoContent();
        })
        .WithName("Delete Environment")
        .WithTags("Environments");
    }
}

public record CreateEnvironmentRequest(
    string Name,
    double LightIntensity,
    string EnvironmentPreset,
    bool ShowShadows,
    bool IsDefault = false,
    string? Description = null
);

public record UpdateEnvironmentRequest(
    string Name,
    string? Description,
    double LightIntensity,
    string EnvironmentPreset,
    bool ShowShadows,
    string? ShadowType,
    double ShadowOpacity,
    double ShadowBlur
);
