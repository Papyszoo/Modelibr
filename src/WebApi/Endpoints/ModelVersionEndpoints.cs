using Application.Abstractions.Messaging;
using Application.Models;
using Microsoft.AspNetCore.Mvc;
using WebApi.Files;

namespace WebApi.Endpoints;

public static class ModelVersionEndpoints
{
    public static void MapModelVersionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/models/{modelId}/versions", CreateModelVersion)
            .WithName("Create Model Version")
            .DisableAntiforgery();

        app.MapPost("/models/{modelId}/versions/{versionId}/files", AddFileToVersion)
            .WithName("Add File To Version")
            .DisableAntiforgery();

        app.MapGet("/models/{modelId}/versions", GetModelVersions)
            .WithName("Get Model Versions");

        app.MapGet("/models/{modelId}/versions/{versionId}", GetModelVersion)
            .WithName("Get Model Version");

        app.MapGet("/models/{modelId}/versions/{versionId}/files/{fileId}", GetVersionFile)
            .WithName("Get Version File");
    }

    private static async Task<IResult> CreateModelVersion(
        int modelId,
        IFormFile file,
        string? description,
        bool setAsActive,
        ICommandHandler<CreateModelVersionCommand, CreateModelVersionResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file.Length <= 0)
        {
            return Results.BadRequest(new { error = "InvalidFile", message = "File is empty or invalid." });
        }

        var command = new CreateModelVersionCommand(
            modelId,
            new FormFileUpload(file),
            description,
            setAsActive);

        var result = await commandHandler.Handle(command, cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> AddFileToVersion(
        int modelId,
        int versionId,
        IFormFile file,
        ICommandHandler<AddFileToVersionCommand, AddFileToVersionResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file.Length <= 0)
        {
            return Results.BadRequest(new { error = "InvalidFile", message = "File is empty or invalid." });
        }

        var command = new AddFileToVersionCommand(
            modelId,
            versionId,
            new FormFileUpload(file));

        var result = await commandHandler.Handle(command, cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetModelVersions(
        int modelId,
        IQueryHandler<GetModelVersionsQuery, GetModelVersionsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetModelVersionsQuery(modelId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value.Versions);
    }

    private static async Task<IResult> GetModelVersion(
        int modelId,
        int versionId,
        IQueryHandler<GetModelVersionQuery, GetModelVersionResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetModelVersionQuery(versionId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value.Version);
    }

    private static async Task<IResult> GetVersionFile(
        int modelId,
        int versionId,
        int fileId,
        HttpContext httpContext,
        IQueryHandler<GetVersionFileQuery, GetVersionFileResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetVersionFileQuery(versionId, fileId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(result.Error.Message);
        }

        var response = result.Value;
        var etag = new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{response.Sha256Hash}\"");
        
        // Check If-None-Match header for cache validation
        if (httpContext.Request.Headers.TryGetValue("If-None-Match", out var ifNoneMatch))
        {
            if (Microsoft.Net.Http.Headers.EntityTagHeaderValue.TryParse(ifNoneMatch.ToString(), out var clientEtag) &&
                clientEtag.Tag.Equals(etag.Tag))
            {
                return Results.StatusCode(StatusCodes.Status304NotModified);
            }
        }

        var fileStream = System.IO.File.OpenRead(response.FilePath);
        
        // Set cache headers - require revalidation with ETag
        httpContext.Response.Headers.CacheControl = "no-cache";
        httpContext.Response.Headers.ETag = etag.ToString();
        
        return Results.File(fileStream, response.MimeType, response.OriginalFileName, enableRangeProcessing: true);
    }
}
