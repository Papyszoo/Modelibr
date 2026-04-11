using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Application.Abstractions.Services;
using Application.EnvironmentMaps;
using Application.Thumbnails;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;
using WebApi.Files;
using WebApi.Infrastructure;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class EnvironmentMapEndpoints
{
    public static void MapEnvironmentMapEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/environment-maps", GetAllEnvironmentMaps)
            .WithName("Get All Environment Maps")
            .WithSummary("Gets all environment maps")
            .WithOpenApi();

        app.MapGet("/environment-maps/{id}", GetEnvironmentMapById)
            .WithName("Get Environment Map By ID")
            .WithSummary("Gets an environment map by ID")
            .WithOpenApi();

        app.MapGet("/environment-maps/{id}/preview", GetEnvironmentMapPreview)
            .WithName("Get Environment Map Preview")
            .WithSummary("Gets the preview thumbnail for an environment map")
            .WithOpenApi();

        app.MapGet("/environment-maps/{id}/variants/{variantId}/preview", GetEnvironmentMapVariantPreview)
            .WithName("Get Environment Map Variant Preview")
            .WithSummary("Gets the preview thumbnail for an environment map variant")
            .WithOpenApi();

        app.MapPost("/environment-maps/{id}/variants/{variantId}/thumbnail/upload", UploadEnvironmentMapVariantThumbnail)
            .WithName("Upload Environment Map Variant Thumbnail")
            .WithTags("Thumbnails")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .DisableAntiforgery();

        app.MapPost("/environment-maps/{id}/variants/{variantId}/thumbnail/png-upload", UploadEnvironmentMapVariantPngThumbnail)
            .WithName("Upload Environment Map Variant PNG Thumbnail")
            .WithTags("Thumbnails")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .DisableAntiforgery();

        app.MapPost("/environment-maps", CreateEnvironmentMap)
            .WithName("Create Environment Map")
            .WithSummary("Creates an environment map from existing file references")
            .WithOpenApi();

        app.MapPost("/environment-maps/with-file", CreateEnvironmentMapWithFile)
            .WithName("Create Environment Map With File")
            .WithSummary("Creates an environment map and uploads its first variant")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapPut("/environment-maps/{id}", UpdateEnvironmentMap)
            .WithName("Update Environment Map")
            .WithSummary("Updates an environment map")
            .WithOpenApi();

        app.MapPost("/environment-maps/{id}/metadata", UpdateEnvironmentMapMetadata)
            .WithName("Update Environment Map Metadata")
            .WithSummary("Updates environment map tags and category")
            .WithOpenApi();

        app.MapPut("/environment-maps/{id}/thumbnail", SetCustomThumbnail)
            .WithName("Set Environment Map Custom Thumbnail")
            .WithSummary("Sets a custom thumbnail for an environment map")
            .WithOpenApi();

        app.MapPost("/environment-maps/{id}/thumbnail/regenerate", RegenerateThumbnail)
            .WithName("Regenerate Environment Map Thumbnail")
            .WithSummary("Regenerates generated thumbnails for an environment map")
            .WithOpenApi();

        app.MapDelete("/environment-maps/{id}", DeleteEnvironmentMap)
            .WithName("Delete Environment Map")
            .WithSummary("Deletes an environment map")
            .WithOpenApi();

        app.MapDelete("/environment-maps/{id}/soft", SoftDeleteEnvironmentMap)
            .WithName("Soft Delete Environment Map")
            .WithSummary("Soft deletes an environment map")
            .WithOpenApi();

        app.MapPost("/environment-maps/{id}/variants", AddVariant)
            .WithName("Add Environment Map Variant")
            .WithSummary("Adds existing files as an environment map variant")
            .WithOpenApi();

        app.MapPost("/environment-maps/{id}/variants/with-file", AddVariantWithFile)
            .WithName("Add Environment Map Variant With File")
            .WithSummary("Uploads and adds an environment map variant")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapDelete("/environment-maps/{id}/variants/{variantId}", RemoveVariant)
            .WithName("Remove Environment Map Variant")
            .WithSummary("Soft deletes an environment map variant")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllEnvironmentMaps(
        int? packId,
        int? projectId,
        int? page,
        int? pageSize,
        IQueryHandler<GetAllEnvironmentMapsQuery, GetAllEnvironmentMapsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllEnvironmentMapsQuery(packId, projectId, page, pageSize), cancellationToken);

        if (result.IsFailure)
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });

        if (page.HasValue && pageSize.HasValue)
        {
            return Results.Ok(new
            {
                environmentMaps = result.Value.EnvironmentMaps,
                totalCount = result.Value.TotalCount,
                page = result.Value.Page,
                pageSize = result.Value.PageSize,
                totalPages = result.Value.TotalPages
            });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetEnvironmentMapById(
        int id,
        IQueryHandler<GetEnvironmentMapByIdQuery, GetEnvironmentMapByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetEnvironmentMapByIdQuery(id), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value.EnvironmentMap)
            : Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> GetEnvironmentMapPreview(
        int id,
        IEnvironmentMapRepository environmentMapRepository,
        IFilePreviewService previewService,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger("EnvironmentMapEndpoints");
        var environmentMap = await environmentMapRepository.GetByIdAsync(id, cancellationToken);
        if (environmentMap == null)
            return Results.NotFound();

        if (environmentMap.CustomThumbnailFile != null)
            return ServePreviewFile(environmentMap.CustomThumbnailFile, previewService);

        var previewVariant = environmentMap.GetPreviewVariant();
        if (previewVariant == null)
            return Results.NotFound();

        return ServeGeneratedEnvironmentMapPreview(
            environmentMap,
            previewVariant,
            previewService,
            logger,
            "selected preview variant");
    }

    private static async Task<IResult> GetEnvironmentMapVariantPreview(
        int id,
        int variantId,
        IEnvironmentMapRepository environmentMapRepository,
        IFilePreviewService previewService,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger("EnvironmentMapEndpoints");
        var environmentMap = await environmentMapRepository.GetByIdAsync(id, cancellationToken);
        if (environmentMap == null)
            return Results.NotFound();

        var variant = environmentMap.GetVariant(variantId);
        if (variant == null)
            return Results.NotFound();

        return ServeGeneratedEnvironmentMapPreview(
            environmentMap,
            variant,
            previewService,
            logger,
            "requested variant");
    }

    private static async Task<IResult> CreateEnvironmentMap(
        [FromBody] CreateEnvironmentMapRequest request,
        ICommandHandler<CreateEnvironmentMapCommand, CreateEnvironmentMapResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new CreateEnvironmentMapCommand(
                request.Name,
                request.FileId,
                request.SizeLabel,
                request.CubeFaces?.ToApplicationModel()),
            cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/environment-maps/{result.Value.Id}", result.Value)
            : MapFailure(result.Error);
    }

    private static async Task<IResult> CreateEnvironmentMapWithFile(
        IFormFile? file,
        IFormFile? px,
        IFormFile? nx,
        IFormFile? py,
        IFormFile? ny,
        IFormFile? pz,
        IFormFile? nz,
        string? name,
        string? sizeLabel,
        string? batchId,
        int? packId,
        int? projectId,
        ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var variantUploadResult = CreateVariantUploadInput(file, px, nx, py, ny, pz, nz);
        if (variantUploadResult.IsFailure)
            return Results.BadRequest(new { error = variantUploadResult.Error.Code, message = variantUploadResult.Error.Message });

        var effectiveName = !string.IsNullOrWhiteSpace(name)
            ? name
            : file is { FileName: { Length: > 0 } }
                ? Path.GetFileNameWithoutExtension(file.FileName)
                : "Environment Map";

        var result = await commandHandler.Handle(
            new CreateEnvironmentMapWithFileCommand(
                variantUploadResult.Value.FileUpload,
                variantUploadResult.Value.CubeFaces,
                effectiveName,
                sizeLabel,
                batchId,
                packId,
                projectId),
            cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/environment-maps/{result.Value.EnvironmentMapId}", result.Value)
            : MapFailure(result.Error);
    }

    private static async Task<IResult> UpdateEnvironmentMap(
        int id,
        [FromBody] UpdateEnvironmentMapRequest request,
        ICommandHandler<UpdateEnvironmentMapCommand, UpdateEnvironmentMapResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new UpdateEnvironmentMapCommand(id, request.Name, request.PreviewVariantId), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapFailure(result.Error);
    }

    private static async Task<IResult> UpdateEnvironmentMapMetadata(
        int id,
        [FromBody] UpdateEnvironmentMapMetadataRequest request,
        ICommandHandler<UpdateEnvironmentMapMetadataCommand, UpdateEnvironmentMapMetadataResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateEnvironmentMapMetadataCommand(id, request.Tags, request.CategoryId),
            cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapFailure(result.Error);
    }

    private static async Task<IResult> SetCustomThumbnail(
        int id,
        [FromBody] AttachOptionalFileRequest request,
        ICommandHandler<SetEnvironmentMapCustomThumbnailCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new SetEnvironmentMapCustomThumbnailCommand(id, request.FileId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : MapFailure(result.Error);
    }

    private static async Task<IResult> RegenerateThumbnail(
        int id,
        int? variantId,
        ICommandHandler<RegenerateEnvironmentMapThumbnailCommand, RegenerateEnvironmentMapThumbnailResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new RegenerateEnvironmentMapThumbnailCommand(id, variantId), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(new
            {
                message = "Environment map thumbnail regeneration queued successfully.",
                environmentMapId = result.Value.EnvironmentMapId,
                previewVariantId = result.Value.PreviewVariantId,
                queuedVariantIds = result.Value.RegeneratedVariantIds
            })
            : MapFailure(result.Error);
    }

    private static async Task<IResult> DeleteEnvironmentMap(
        int id,
        ICommandHandler<DeleteEnvironmentMapCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteEnvironmentMapCommand(id), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> SoftDeleteEnvironmentMap(
        int id,
        ICommandHandler<SoftDeleteEnvironmentMapCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new SoftDeleteEnvironmentMapCommand(id), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : MapFailure(result.Error);
    }

    private static async Task<IResult> AddVariant(
        int id,
        [FromBody] AddEnvironmentMapVariantRequest request,
        ICommandHandler<AddEnvironmentMapVariantCommand, AddEnvironmentMapVariantResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new AddEnvironmentMapVariantCommand(
                id,
                request.FileId,
                request.SizeLabel,
                request.CubeFaces?.ToApplicationModel()),
            cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapFailure(result.Error);
    }

    private static async Task<IResult> AddVariantWithFile(
        int id,
        IFormFile? file,
        IFormFile? px,
        IFormFile? nx,
        IFormFile? py,
        IFormFile? ny,
        IFormFile? pz,
        IFormFile? nz,
        string? sizeLabel,
        ICommandHandler<AddEnvironmentMapVariantWithFileCommand, AddEnvironmentMapVariantResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var variantUploadResult = CreateVariantUploadInput(file, px, nx, py, ny, pz, nz);
        if (variantUploadResult.IsFailure)
            return Results.BadRequest(new { error = variantUploadResult.Error.Code, message = variantUploadResult.Error.Message });

        var result = await commandHandler.Handle(
            new AddEnvironmentMapVariantWithFileCommand(
                id,
                variantUploadResult.Value.FileUpload,
                variantUploadResult.Value.CubeFaces,
                sizeLabel),
            cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapFailure(result.Error);
    }

    private static async Task<IResult> RemoveVariant(
        int id,
        int variantId,
        ICommandHandler<RemoveEnvironmentMapVariantCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new RemoveEnvironmentMapVariantCommand(id, variantId), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : MapFailure(result.Error);
    }

    private static async Task<IResult> UploadEnvironmentMapVariantThumbnail(
        int id,
        int variantId,
        IFormFile file,
        ICommandHandler<UploadEnvironmentMapVariantThumbnailCommand, UploadEnvironmentMapVariantThumbnailCommandResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UploadEnvironmentMapVariantThumbnailCommand(id, variantId, new FormFileUpload(file)),
            cancellationToken);

        if (result.IsFailure)
            return MapFailure(result.Error);

        return Results.Ok(new
        {
            Message = "Environment map thumbnail uploaded",
            result.Value.EnvironmentMapId,
            result.Value.VariantId,
            result.Value.ThumbnailPath
        });
    }

    private static async Task<IResult> UploadEnvironmentMapVariantPngThumbnail(
        int id,
        int variantId,
        IFormFile file,
        ICommandHandler<UploadEnvironmentMapVariantThumbnailCommand, UploadEnvironmentMapVariantThumbnailCommandResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UploadEnvironmentMapVariantThumbnailCommand(id, variantId, new FormFileUpload(file)),
            cancellationToken);

        if (result.IsFailure)
            return MapFailure(result.Error);

        return Results.Ok(new
        {
            Message = "Environment map PNG thumbnail uploaded",
            result.Value.EnvironmentMapId,
            result.Value.VariantId,
            result.Value.ThumbnailPath
        });
    }

    private static IResult ServePreviewFile(Domain.Models.File? file, IFilePreviewService previewService)
    {
        if (file == null)
            return Results.NotFound();

        var previewPath = previewService.GetPreviewPath(file.Sha256Hash, "rgb") ?? previewService.GetPreviewPath(file.Sha256Hash);
        return previewPath == null
            ? Results.NotFound()
            : Results.File(previewPath, "image/png");
    }

    private static IResult ServeGeneratedEnvironmentMapPreview(
        Domain.Models.EnvironmentMap environmentMap,
        Domain.Models.EnvironmentMapVariant variant,
        IFilePreviewService previewService,
        ILogger logger,
        string previewDescription)
    {
        var thumbnailPath = variant.ThumbnailPath;

        if (string.IsNullOrEmpty(thumbnailPath) || !System.IO.File.Exists(thumbnailPath))
        {
            logger.LogInformation(
                "Environment map preview thumbnail is not ready for environment map {EnvironmentMapId}, variant {VariantId}. Serving fallback preview for {PreviewDescription}.",
                environmentMap.Id,
                variant.Id,
                previewDescription);

            return ServePreviewFile(
                variant.GetPreviewFile(),
                previewService,
                logger,
                environmentMap.Id,
                variant.Id,
                "source-file preview");
        }

        logger.LogInformation(
            "Serving environment map preview thumbnail for environment map {EnvironmentMapId}, variant {VariantId} from {ThumbnailPath}",
            environmentMap.Id,
            variant.Id,
            thumbnailPath);

        return Results.File(thumbnailPath, ContentTypeProvider.GetContentType(thumbnailPath));
    }

    private static IResult ServePreviewFile(
        Domain.Models.File? file,
        IFilePreviewService previewService,
        ILogger logger,
        int environmentMapId,
        int variantId,
        string fallbackKind)
    {
        if (file == null)
        {
            logger.LogWarning(
                "Environment map preview fallback {FallbackKind} could not be served for environment map {EnvironmentMapId}, variant {VariantId} because no source file was available.",
                fallbackKind,
                environmentMapId,
                variantId);

            return Results.NotFound();
        }

        var previewPath = previewService.GetPreviewPath(file.Sha256Hash, "rgb") ?? previewService.GetPreviewPath(file.Sha256Hash);
        if (previewPath == null)
        {
            logger.LogWarning(
                "Environment map preview fallback {FallbackKind} could not be served for environment map {EnvironmentMapId}, variant {VariantId} because no preview file was available for source file {FileId}.",
                fallbackKind,
                environmentMapId,
                variantId,
                file.Id);

            return Results.NotFound();
        }

        logger.LogInformation(
            "Serving environment map preview fallback {FallbackKind} for environment map {EnvironmentMapId}, variant {VariantId} from {PreviewPath}",
            fallbackKind,
            environmentMapId,
            variantId,
            previewPath);

        return Results.File(previewPath, "image/png");
    }

    private static Result<EnvironmentMapVariantUploadInputModel> CreateVariantUploadInput(
        IFormFile? file,
        IFormFile? px,
        IFormFile? nx,
        IFormFile? py,
        IFormFile? ny,
        IFormFile? pz,
        IFormFile? nz)
    {
        var cubeFiles = new[] { px, nx, py, ny, pz, nz };
        var hasCubeFiles = cubeFiles.Any(f => f is { Length: > 0 });
        var hasSingleFile = file is { Length: > 0 };

        if (hasSingleFile && hasCubeFiles)
        {
            return Result.Failure<EnvironmentMapVariantUploadInputModel>(
                new Error("InvalidInput", "Provide either a single panoramic file or all six cube face files, not both."));
        }

        if (hasCubeFiles)
        {
            if (cubeFiles.Any(f => f == null || f.Length == 0))
            {
                return Result.Failure<EnvironmentMapVariantUploadInputModel>(
                    new Error("InvalidInput", "Cube uploads require all six face files: px, nx, py, ny, pz, nz."));
            }

            return Result.Success(new EnvironmentMapVariantUploadInputModel(
                null,
                new EnvironmentMapCubeFaceUploads(
                    new WebApi.Files.FormFileUpload(px!),
                    new WebApi.Files.FormFileUpload(nx!),
                    new WebApi.Files.FormFileUpload(py!),
                    new WebApi.Files.FormFileUpload(ny!),
                    new WebApi.Files.FormFileUpload(pz!),
                    new WebApi.Files.FormFileUpload(nz!))));
        }

        if (!hasSingleFile)
        {
            return Result.Failure<EnvironmentMapVariantUploadInputModel>(
                new Error("InvalidInput", "File is required."));
        }

        return Result.Success(new EnvironmentMapVariantUploadInputModel(new WebApi.Files.FormFileUpload(file!), null));
    }

    private static IResult MapFailure(Error error)
    {
        return error.Code switch
        {
            "EnvironmentMapNotFound" or "FileNotFound" => Results.NotFound(new { error = error.Code, message = error.Message }),
            _ => Results.BadRequest(new { error = error.Code, message = error.Message })
        };
    }

    private sealed record EnvironmentMapVariantUploadInputModel(
        WebApi.Files.FormFileUpload? FileUpload,
        EnvironmentMapCubeFaceUploads? CubeFaces);
}

public record CreateEnvironmentMapRequest(string Name, int? FileId, string? SizeLabel, EnvironmentMapCubeFacesRequest? CubeFaces);
public record UpdateEnvironmentMapRequest(string? Name, int? PreviewVariantId);
public record UpdateEnvironmentMapMetadataRequest(IReadOnlyList<string>? Tags, int? CategoryId);
public record AddEnvironmentMapVariantRequest(int? FileId, string? SizeLabel, EnvironmentMapCubeFacesRequest? CubeFaces);
public record EnvironmentMapCubeFacesRequest(int Px, int Nx, int Py, int Ny, int Pz, int Nz)
{
    public EnvironmentMapCubeFaceFileIds ToApplicationModel() => new(Px, Nx, Py, Ny, Pz, Nz);
}
