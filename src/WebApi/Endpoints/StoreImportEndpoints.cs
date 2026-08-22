using Application.Abstractions.Messaging;
using Application.StoreImports;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class StoreImportEndpoints
{
    public static void MapStoreImportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/store-imports", StartImport)
            .WithName("Start Store Import")
            .WithSummary("Starts a background import of an asset pack from the companion Asset Store")
            .WithOpenApi();

        app.MapGet("/store-imports/{id}", GetImportJob)
            .WithName("Get Store Import Job")
            .WithSummary("Gets the status and per-item outcomes of a store import job")
            .WithOpenApi();
    }

    private static async Task<IResult> StartImport(
        [FromBody] StoreImportRequest request,
        ICommandHandler<CreateStoreImportCommand, CreateStoreImportResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var command = new CreateStoreImportCommand(request.StoreUrl, request.AssetId, request.ImportToken, request.SelectedItemIds);
        var result = await commandHandler.Handle(command, cancellationToken);

        return result.IsSuccess
            ? Results.Accepted($"/store-imports/{result.Value.JobId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> GetImportJob(
        int id,
        IQueryHandler<GetStoreImportJobQuery, StoreImportJobDto> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetStoreImportJobQuery(id), cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
    }
}

/// <summary>
/// Request body for POST /store-imports. The frontend obtains <paramref name="ImportToken"/>
/// from the store's <c>POST /api/library/{assetId}/import-token</c> (browser-side) and hands it
/// to the local backend, which never sees the user's store JWT. It may be omitted for an
/// approved free asset, which the store serves anonymously - a signed-out user can still
/// import CC0 content. <paramref name="SelectedItemIds"/> scopes a partial import to specific
/// manifest items; omit or leave empty to import the whole pack.
/// </summary>
public record StoreImportRequest(
    string StoreUrl, string AssetId, string? ImportToken = null, IReadOnlyList<string>? SelectedItemIds = null);
