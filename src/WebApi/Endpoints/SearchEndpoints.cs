using Application.Abstractions.Messaging;
using Application.Search;

namespace WebApi.Endpoints;

public static class SearchEndpoints
{
    public static void MapSearchEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/search", async (
            string? q,
            int? perType,
            IQueryHandler<GlobalSearchQuery, GlobalSearchResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(
                new GlobalSearchQuery(q ?? string.Empty, perType ?? 8),
                cancellationToken);

            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new { groups = result.Value.Groups });
        })
        .WithName("Global Search")
        .WithTags("Search");
    }
}
