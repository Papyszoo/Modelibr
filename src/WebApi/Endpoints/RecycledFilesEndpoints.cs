using Application.Abstractions.Messaging;
using Application.RecycledFiles;

namespace WebApi.Endpoints;

public static class RecycledFilesEndpoints
{
    public static void MapRecycledFilesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/recycledFiles", async (IQueryHandler<GetAllRecycledFilesQuery, GetAllRecycledFilesResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetAllRecycledFilesQuery(), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get All Recycled Files")
        .WithSummary("Get all recycled files")
        .WithTags("RecycledFiles");

        app.MapPost("/recycledFiles/{id}/restore", async (
            int id,
            ICommandHandler<RestoreRecycledFileCommand> commandHandler) =>
        {
            var result = await commandHandler.Handle(new RestoreRecycledFileCommand(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new { message = "File restored successfully" });
        })
        .WithName("Restore Recycled File")
        .WithSummary("Restore a recycled file (removes it from recycle bin)")
        .WithTags("RecycledFiles");
    }
}
