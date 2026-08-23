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

        // Rebuild the projection search reads, from layers already stored. Separate from
        // re-extraction because the two fix different staleness: this one rewrites the
        // index (vocabulary, denormalised tags/packs/category), while trigger_rederive is
        // what recomputes the signals underneath it.
        app.MapPost("/search/reindex", async (
            int? modelId,
            ICommandHandler<ReprojectSearchDocumentsCommand, ReprojectSearchDocumentsResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(
                new ReprojectSearchDocumentsCommand(modelId),
                cancellationToken);

            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new
            {
                reprojected = result.Value.Reprojected,
                documentsWritten = result.Value.DocumentsWritten,
                skipped = result.Value.Skipped,
                notes = result.Value.Notes,
            });
        })
        .WithName("Reindex Search")
        .WithTags("Search");

        app.MapGet("/search/index-status", async (
            IQueryHandler<GetIndexStatusQuery, IndexStatusResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new GetIndexStatusQuery(), cancellationToken);

            return result.IsFailure
                ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
                : Results.Ok(result.Value);
        })
        .WithName("Get Index Status")
        .WithSummary("How much of the library is derived, indexed, and behind the current projection")
        .WithTags("Search");
    }
}
