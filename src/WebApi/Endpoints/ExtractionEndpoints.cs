using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Extraction;
using Application.Extraction.Compute;
using Application.Extraction.Jobs;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;
using WebApi.Infrastructure;

namespace WebApi.Endpoints;

/// <summary>
/// Generic worker-facing extraction persistence for non-mesh asset families. Models
/// keep their bespoke scene-graph endpoint (per-part rows + flat projection); every
/// other family (texture sets, sounds, scripts, sprites, env maps) just upserts its
/// verbatim payload into the extraction substrate through this one route.
/// </summary>
public static class ExtractionEndpoints
{
    public static void MapExtractionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/assets/{assetType}/{assetId:int}/extraction", ImportAssetExtraction)
            .WithName("Import Asset Extraction")
            .WithSummary("Upserts a raw extraction payload for a non-mesh asset family (worker only)")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .WithOpenApi();

        // Derived metadata + part detail reads (wrapped by MCP get_asset/get_part).
        app.MapGet("/assets/{assetType}/{assetId:int}/metadata", GetAssetMetadata)
            .WithName("Get Asset Metadata")
            .WithSummary("Derived metadata + parts for an asset (active version unless ?versionId= says otherwise)")
            .WithOpenApi();

        app.MapGet("/assets/{assetType}/{assetId:int}/parts/{**partPath}", GetAssetPart)
            .WithName("Get Asset Part")
            .WithSummary("Derived metadata + a single part's detail by part path")
            .WithOpenApi();

        // On-demand expensive compute, cached by geometry hash (prompt 25).
        app.MapGet("/assets/compute", GetComputeResult)
            .WithName("Get Compute Result")
            .WithSummary("Returns a cached expensive-compute metric by geometry hash, or 'pending'")
            .WithOpenApi();

        app.MapPut("/compute-cache", StoreComputeResult)
            .WithName("Store Compute Result")
            .WithSummary("Stores a computed expensive-metric result keyed by geometry hash (worker only)")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .WithOpenApi();

        // Decoupled extraction queue (prompt 20 executor): worker claims + finishes jobs.
        app.MapPost("/extraction-jobs/dequeue", DequeueExtractionJob)
            .WithName("Dequeue Extraction Job")
            .WithSummary("Claims the next runnable extraction job in a family (worker only)")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .WithOpenApi();

        app.MapPost("/extraction-jobs/{id:int}/finish", FinishExtractionJob)
            .WithName("Finish Extraction Job")
            .WithSummary("Reports success/failure for a claimed extraction job (worker only)")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .WithOpenApi();
    }

    private static async Task<IResult> DequeueExtractionJob(
        [FromBody] DequeueExtractionJobRequest request,
        ICommandHandler<DequeueExtractionJobCommand, DequeueExtractionJobResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new DequeueExtractionJobCommand(request.WorkerId ?? string.Empty, request.ExtractorFamily),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        // 204 when the queue is empty so the worker poller can cheaply detect "nothing to do".
        return result.Value.Job is null
            ? Results.NoContent()
            : Results.Ok(result.Value.Job);
    }

    private static async Task<IResult> FinishExtractionJob(
        int id,
        [FromBody] FinishExtractionJobRequest request,
        ICommandHandler<FinishExtractionJobCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new FinishExtractionJobCommand(
                id, request.WorkerId ?? string.Empty, request.Success, request.ErrorMessage, request.WarningDetail),
            cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code == "ExtractionJobNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> GetAssetMetadata(
        string assetType,
        int assetId,
        int? versionId,
        IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(
            new GetAssetMetadataQuery(assetType, assetId, VersionId: versionId), cancellationToken);
        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetAssetPart(
        string assetType,
        int assetId,
        string partPath,
        int? versionId,
        IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(
            new GetAssetMetadataQuery(assetType, assetId, partPath, versionId), cancellationToken);
        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetComputeResult(
        string geometryHash,
        string metric,
        int? hashVersion,
        IQueryHandler<GetComputeResultQuery, ComputeResultResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(
            new GetComputeResultQuery(geometryHash ?? string.Empty, hashVersion ?? 1, metric ?? string.Empty),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        // 200 with the result when cached; 202 Accepted while it hasn't been computed.
        return result.Value.Status == "cached"
            ? Results.Ok(new { status = result.Value.Status, result = result.Value.Result })
            : Results.Accepted(value: new { status = result.Value.Status });
    }

    private static async Task<IResult> StoreComputeResult(
        [FromBody] StoreComputeResultRequest request,
        ICommandHandler<StoreComputeResultCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new StoreComputeResultCommand(
                request.GeometryHash ?? string.Empty,
                request.GeometryHashVersion <= 0 ? 1 : request.GeometryHashVersion,
                request.Metric ?? string.Empty,
                request.Payload?.GetRawText() ?? "{}"),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> ImportAssetExtraction(
        string assetType,
        int assetId,
        [FromBody] ImportAssetExtractionRequest request,
        ICommandHandler<ImportAssetExtractionCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        ExtractionOutcome? outcome = null;
        if (!string.IsNullOrWhiteSpace(request.Outcome) &&
            Enum.TryParse<ExtractionOutcome>(request.Outcome, ignoreCase: true, out var parsed))
        {
            outcome = parsed;
        }

        var command = new ImportAssetExtractionCommand(
            assetType,
            assetId,
            request.VersionId,
            request.FileSha256 ?? string.Empty,
            // Store the extractor's payload object verbatim as the raw source of truth.
            request.Payload?.GetRawText() ?? "{}",
            request.ExtractorVersion,
            request.SchemaVersion <= 0 ? 1 : request.SchemaVersion,
            outcome,
            request.Warnings ?? new List<string>());

        var result = await commandHandler.Handle(command, cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

public record ImportAssetExtractionRequest(
    int? VersionId,
    string? FileSha256,
    int ExtractorVersion,
    int SchemaVersion,
    string? Outcome,
    JsonElement? Payload,
    List<string>? Warnings);

public record StoreComputeResultRequest(
    string? GeometryHash,
    int GeometryHashVersion,
    string? Metric,
    JsonElement? Payload);

public record DequeueExtractionJobRequest(string? WorkerId, string? ExtractorFamily);

/// <summary><c>WorkerId</c> must be the worker that holds the claim - a lapsed lease may not report an outcome.</summary>
public record FinishExtractionJobRequest(string? WorkerId, bool Success, string? ErrorMessage, string? WarningDetail);
