using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Metadata;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

/// <summary>
/// The asset metadata schema (prompt 16): the contract, and one asset's values against it.
///
/// Routed under <c>/metadata</c> rather than under the asset - <c>/assets/{type}/{id}/metadata</c>
/// already serves the <b>derived</b> extraction payload, and two different things called
/// "metadata" on one path would be a permanent source of confusion.
/// </summary>
public static class AssetMetadataEndpoints
{
    public static void MapAssetMetadataEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/metadata/schema", GetSchema)
            .WithName("Get Asset Metadata Schema")
            .WithSummary("The versioned asset metadata schema: every field an asset can carry, per family")
            .WithOpenApi();

        app.MapGet("/metadata/{assetType}/{assetId:int}", GetMetadata)
            .WithName("Get Asset Metadata Values")
            .WithSummary("Every schema field's current value for one asset, plus what is still missing")
            .WithOpenApi();

        // PATCH, not PUT: the body is a patch. An absent key means "leave it", a null value
        // means "clear it", and PUT would promise a replace the handler deliberately does not do.
        app.MapPatch("/metadata/{assetType}/{assetId:int}", SetMetadata)
            .WithName("Set Asset Metadata Values")
            .WithSummary("Merges schema fields onto an asset; absent = unchanged, null = cleared")
            .WithOpenApi();

        app.MapGet("/metadata/import-suggestions", GetImportSuggestions)
            .WithName("Get Import Suggestions")
            .WithSummary("Assets the import automation categorized or tagged that nobody has reviewed yet")
            .WithOpenApi();

        app.MapPost("/metadata/import-suggestions/review", ReviewImportSuggestions)
            .WithName("Review Import Suggestions")
            .WithSummary("Accepts or takes back the import automation's guesses, in bulk")
            .WithOpenApi();
    }

    /// <param name="ModelIds">Which assets to settle. Omit or leave empty to settle everything waiting.</param>
    /// <param name="Accept">True keeps what was applied, false takes it back.</param>
    public record ReviewImportSuggestionsRequest(IReadOnlyList<int>? ModelIds, bool Accept = true);

    private static async Task<IResult> GetImportSuggestions(
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        IQueryHandler<ImportSuggestionsQuery, ImportSuggestionsResponse> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(
            new ImportSuggestionsQuery(page ?? 1, pageSize ?? 50), cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> ReviewImportSuggestions(
        [FromBody] ReviewImportSuggestionsRequest body,
        ICommandHandler<ReviewImportSuggestionsCommand, ReviewImportSuggestionsResponse> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(
            new ReviewImportSuggestionsCommand(body.ModelIds, body.Accept), cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetSchema(
        [FromQuery] string? assetType,
        IQueryHandler<GetAssetMetadataSchemaQuery, AssetMetadataSchemaResponse> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new GetAssetMetadataSchemaQuery(assetType), cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetMetadata(
        string assetType,
        int assetId,
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new ReadAssetMetadataQuery(assetType, assetId), cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code is "AssetNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> SetMetadata(
        string assetType,
        int assetId,
        [FromBody] JsonElement body,
        ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse> handler,
        CancellationToken cancellationToken)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return Results.BadRequest(new
            {
                error = "InvalidMetadataPatch",
                message = "The body must be a JSON object of schema field keys to values."
            });
        }

        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var property in body.EnumerateObject())
        {
            fields[property.Name] = property.Value.Clone();
        }

        var result = await handler.Handle(
            new SetAssetMetadataCommand(assetType, assetId, fields), cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code is "AssetNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }
}
