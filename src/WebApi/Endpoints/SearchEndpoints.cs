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

            // The whole response, not a two-field projection of it. `profile` says what a
            // project's style did to the ranking and `query` says what the search understood
            // - both are how a caller tells a result it disagrees with from one it never
            // asked for, and this endpoint was quietly dropping them on the floor.
            return Results.Ok(result.Value);
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

        app.MapGet("/search/facet-ranges", async (
            string? assetType,
            IQueryHandler<GetSearchFacetRangesQuery, SearchFacetRangesResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(new GetSearchFacetRangesQuery(assetType), cancellationToken);

            return result.IsFailure
                ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
                : Results.Ok(result.Value);
        })
        .WithName("Get Search Facet Ranges")
        .WithSummary("The real distribution behind each numeric filter, and the values the categorical ones hold")
        .WithTags("Search");

        app.MapGet("/search/duplicates", async (
            int? page,
            int? pageSize,
            IQueryHandler<DuplicateAssetsQuery, DuplicateAssetsResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new DuplicateAssetsQuery(page ?? 1, pageSize ?? 25), cancellationToken);

            return result.IsFailure
                ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
                : Results.Ok(result.Value);
        })
        .WithName("Get Duplicate Assets")
        .WithSummary("Groups of assets that carry the same geometry - the same meshes under two ids")
        .WithTags("Search");

        app.MapPost("/search/duplicates/collapse", async (
            CollapseDuplicatesRequest body,
            ICommandHandler<CollapseDuplicateAssetsCommand, CollapseDuplicateAssetsResponse> handler,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.Handle(
                new CollapseDuplicateAssetsCommand(
                    body.SurvivorModelId, body.RedundantModelIds ?? Array.Empty<int>(), body.DryRun),
                cancellationToken);

            return result.IsFailure
                ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
                : Results.Ok(result.Value);
        })
        .WithName("Collapse Duplicate Assets")
        .WithSummary("Keeps one copy of a same-geometry group and recycles the rest (restorable)")
        .WithTags("Search");
    }

    /// <param name="SurvivorModelId">The copy to keep.</param>
    /// <param name="RedundantModelIds">The copies to recycle. Each must carry the survivor's geometry.</param>
    public record CollapseDuplicatesRequest(
        int SurvivorModelId,
        IReadOnlyList<int>? RedundantModelIds,
        bool DryRun = false);
}
