using Application.Abstractions.Messaging;
using Application.Models;
using Microsoft.AspNetCore.Mvc;
using WebApi.Files;
using WebApi.Services;

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

        app.MapGet("/models/{modelId}/versions/{versionId}/file", GetVersionRenderableFile)
            .WithName("Get Version Renderable File");

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

    private static async Task<IResult> GetVersionRenderableFile(
        int modelId,
        int versionId,
        IQueryHandler<GetVersionRenderableFileQuery, GetVersionRenderableFileResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetVersionRenderableFileQuery(versionId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(result.Error.Message);
        }

        var fileStream = System.IO.File.OpenRead(result.Value.FullPath);
        var contentType = ContentTypeProvider.GetContentType(result.Value.OriginalFileName);
        
        return Results.File(fileStream, contentType, result.Value.OriginalFileName, enableRangeProcessing: true);
    }

    private static async Task<IResult> GetVersionFile(
        int modelId,
        int versionId,
        int fileId,
        IQueryHandler<GetVersionFileQuery, GetVersionFileResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetVersionFileQuery(versionId, fileId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(result.Error.Message);
        }

        var fileStream = System.IO.File.OpenRead(result.Value.FilePath);
        return Results.File(fileStream, result.Value.MimeType, result.Value.OriginalFileName, enableRangeProcessing: true);
    }
}
