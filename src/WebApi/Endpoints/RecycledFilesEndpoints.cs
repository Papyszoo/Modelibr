using Application.Abstractions.Messaging;
using Application.RecycledFiles;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class RecycledFilesEndpoints
{
    public static void MapRecycledFilesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/recycled", async (
            IQueryHandler<GetAllRecycledQuery, GetAllRecycledQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetAllRecycledQuery(), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Get All Recycled Files")
        .WithTags("RecycledFiles");

        app.MapPost("/recycled/{entityType}/{entityId}/restore", async (
            string entityType,
            int entityId,
            ICommandHandler<RestoreEntityCommand, RestoreEntityResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var command = new RestoreEntityCommand(entityType, entityId);
            var result = await commandHandler.Handle(command, cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Restore Entity")
        .WithTags("RecycledFiles");

        app.MapGet("/recycled/{entityType}/{entityId}/preview", async (
            string entityType,
            int entityId,
            IQueryHandler<GetDeletePreviewQuery, GetDeletePreviewResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var query = new GetDeletePreviewQuery(entityType, entityId);
            var result = await queryHandler.Handle(query, cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Get Delete Preview")
        .WithTags("RecycledFiles");

        app.MapDelete("/recycled/{entityType}/{entityId}/permanent", async (
            string entityType,
            int entityId,
            ICommandHandler<PermanentDeleteEntityCommand, PermanentDeleteEntityResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var command = new PermanentDeleteEntityCommand(entityType, entityId);
            var result = await commandHandler.Handle(command, cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }
            
            return Results.Ok(result.Value);
        })
        .WithName("Permanently Delete Entity")
        .WithTags("RecycledFiles");
    }
}
