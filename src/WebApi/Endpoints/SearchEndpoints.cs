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

        // Structured search over the derived-layer projection (the MCP payoff).
        app.MapGet("/search/assets", async (
            string? q,
            int? limit,
            bool? includeSecondary,
            int? minTriangles,
            int? maxTriangles,
            bool? hasAnimations,
            string? shapeClass,
            string? engine,
            string? assetType,
            IQueryHandler<AssetSearchQuery, AssetSearchResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(
                new AssetSearchQuery(
                    q ?? string.Empty,
                    limit ?? 25,
                    includeSecondary ?? false,
                    minTriangles,
                    maxTriangles,
                    hasAnimations,
                    shapeClass,
                    engine,
                    assetType),
                cancellationToken);

            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new { hits = result.Value.Hits, totalCount = result.Value.TotalCount });
        })
        .WithName("Asset Search")
        .WithTags("Search");
    }
}
