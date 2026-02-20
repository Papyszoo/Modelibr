using Application.Abstractions.Messaging;
using Application.Models;
using Application.Thumbnails;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;
using WebApi.Files;
using WebApi.Infrastructure;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class ThumbnailEndpoints
{
    public static void MapThumbnailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/models/{id}/thumbnail", async (
            int id, 
            IQueryHandler<GetThumbnailStatusQuery, GetThumbnailStatusQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetThumbnailStatusQuery(id), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var response = result.Value;
            
            // Create response object with file URL if thumbnail is ready
            var thumbnailInfo = new
            {
                Status = response.Status.ToString(),
                ActiveVersionId = response.ActiveVersionId,
                FileUrl = response.Status == ThumbnailStatus.Ready && !string.IsNullOrEmpty(response.ThumbnailPath) 
                    ? $"/models/{id}/thumbnail/file" 
                    : null,
                SizeBytes = response.SizeBytes,
                Width = response.Width,
                Height = response.Height,
                ErrorMessage = response.ErrorMessage,
                CreatedAt = response.CreatedAt,
                ProcessedAt = response.ProcessedAt
            };

            // Add cache headers for ready thumbnails - include version ID for proper cache invalidation
            if (response.Status == ThumbnailStatus.Ready)
            {
                var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
                if (httpContext != null)
                {
                    httpContext.Response.Headers.CacheControl = "public, max-age=3600"; // Cache for 1 hour
                    // Include version ID in ETag to ensure cache invalidation when active version changes
                    httpContext.Response.Headers.ETag = $"\"{id}-v{response.ActiveVersionId}-{response.ProcessedAt?.Ticks}\"";
                }
            }

            return Results.Ok(thumbnailInfo);
        })
        .WithName("Get Thumbnail Status")
        .WithTags("Thumbnails");

        app.MapPost("/models/{id}/thumbnail/regenerate", async (
            int id,
            [FromQuery] int? versionId,
            ICommandHandler<RegenerateThumbnailCommand, RegenerateThumbnailCommandResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new RegenerateThumbnailCommand(id, versionId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            return Results.Ok(new { Message = "Thumbnail regeneration queued successfully", ModelId = result.Value.ModelId, ModelVersionId = result.Value.ModelVersionId });
        })
        .WithName("Regenerate Thumbnail")
        .WithTags("Thumbnails");

        app.MapPost("/models/{id}/thumbnail/upload", async (
            int id,
            IFormFile file,
            [FromForm] int? width,
            [FromForm] int? height,
            [FromForm] int? versionId,
            ICommandHandler<UploadThumbnailCommand, UploadThumbnailCommandResponse> commandHandler,
            IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> modelQueryHandler,
            Application.Settings.ISettingsService settingsService,
            CancellationToken cancellationToken) =>
        {
            var settings = await settingsService.GetSettingsAsync(cancellationToken);
            // Validate file
            var validationResult = ValidateThumbnailFile(file, settings.MaxThumbnailSizeBytes);
            if (validationResult.IsFailure)
            {
                return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
            }

            // If versionId not provided, get the active version
            int targetVersionId;
            if (versionId.HasValue)
            {
                targetVersionId = versionId.Value;
            }
            else
            {
                var modelResult = await modelQueryHandler.Handle(new GetModelByIdQuery(id), cancellationToken);
                if (modelResult.IsFailure || modelResult.Value.Model.ActiveVersionId == null)
                {
                    return Results.BadRequest(new { error = "NoActiveVersion", message = "Model has no active version and versionId was not provided." });
                }
                targetVersionId = modelResult.Value.Model.ActiveVersionId.Value;
            }

            var command = new UploadThumbnailCommand(id, targetVersionId, new FormFileUpload(file), width, height);
            var result = await commandHandler.Handle(command, cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new 
            { 
                Message = "Thumbnail uploaded successfully", 
                ModelId = result.Value.ModelId,
                ThumbnailPath = result.Value.ThumbnailPath,
                SizeBytes = result.Value.SizeBytes,
                Width = result.Value.Width,
                Height = result.Value.Height
            });
        })
        .WithName("Upload Thumbnail")
        .WithTags("Thumbnails")
        .AddEndpointFilter<WorkerApiKeyFilter>()
        .DisableAntiforgery();

        app.MapPost("/models/{id}/thumbnail/png-upload", async (
            int id,
            IFormFile file,
            [FromForm] int? width,
            [FromForm] int? height,
            [FromForm] int? versionId,
            ICommandHandler<UploadPngThumbnailCommand, UploadPngThumbnailCommandResponse> commandHandler,
            IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> modelQueryHandler,
            Application.Settings.ISettingsService settingsService,
            CancellationToken cancellationToken) =>
        {
            var settings = await settingsService.GetSettingsAsync(cancellationToken);
            // Validate file
            var validationResult = ValidateThumbnailFile(file, settings.MaxThumbnailSizeBytes);
            if (validationResult.IsFailure)
            {
                return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
            }

            // If versionId not provided, get the active version
            int targetVersionId;
            if (versionId.HasValue)
            {
                targetVersionId = versionId.Value;
            }
            else
            {
                var modelResult = await modelQueryHandler.Handle(new GetModelByIdQuery(id), cancellationToken);
                if (modelResult.IsFailure || modelResult.Value.Model.ActiveVersionId == null)
                {
                    return Results.BadRequest(new { error = "NoActiveVersion", message = "Model has no active version and versionId was not provided." });
                }
                targetVersionId = modelResult.Value.Model.ActiveVersionId.Value;
            }

            var command = new UploadPngThumbnailCommand(id, targetVersionId, new FormFileUpload(file), width, height);
            var result = await commandHandler.Handle(command, cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new 
            { 
                Message = "PNG thumbnail uploaded successfully", 
                ModelId = result.Value.ModelId,
                PngThumbnailPath = result.Value.PngThumbnailPath,
                SizeBytes = result.Value.SizeBytes,
                Width = result.Value.Width,
                Height = result.Value.Height
            });
        })
        .WithName("Upload PNG Thumbnail")
        .WithTags("Thumbnails")
        .AddEndpointFilter<WorkerApiKeyFilter>()
        .DisableAntiforgery();

        app.MapGet("/models/{id}/thumbnail/file", async (
            int id,
            IQueryHandler<GetThumbnailStatusQuery, GetThumbnailStatusQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetThumbnailStatusQuery(id), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var response = result.Value;
            
            if (response.Status != ThumbnailStatus.Ready || string.IsNullOrEmpty(response.ThumbnailPath))
            {
                return Results.NotFound("Thumbnail not ready or not found");
            }

            // Ensure the directory exists before checking file existence
            var directory = Path.GetDirectoryName(response.ThumbnailPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            
            if (!System.IO.File.Exists(response.ThumbnailPath))
            {
                return Results.NotFound("Thumbnail file not found on disk");
            }

            var fileStream = System.IO.File.OpenRead(response.ThumbnailPath);
            var contentType = ContentTypeProvider.GetContentType(response.ThumbnailPath);
            
            // Add cache headers for thumbnail files - include version ID for proper cache invalidation
            var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            if (httpContext != null)
            {
                httpContext.Response.Headers.CacheControl = "public, max-age=86400"; // Cache for 24 hours
                // Include version ID in ETag to ensure cache invalidation when active version changes
                httpContext.Response.Headers.ETag = $"\"{id}-v{response.ActiveVersionId}-{response.ProcessedAt?.Ticks}\"";
            }
            
            return Results.File(fileStream, contentType, enableRangeProcessing: true);
        })
        .WithName("Get Thumbnail File")
        .WithTags("Thumbnails");

        app.MapGet("/models/{id}/thumbnail/png-file", async (
            int id,
            IQueryHandler<GetThumbnailStatusQuery, GetThumbnailStatusQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetThumbnailStatusQuery(id), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var response = result.Value;
            
            if (response.Status != ThumbnailStatus.Ready || string.IsNullOrEmpty(response.PngThumbnailPath))
            {
                return Results.NotFound("PNG thumbnail not ready or not found");
            }

            // Ensure the directory exists before checking file existence
            var directory = Path.GetDirectoryName(response.PngThumbnailPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            
            if (!System.IO.File.Exists(response.PngThumbnailPath))
            {
                return Results.NotFound("PNG thumbnail file not found on disk");
            }

            var fileStream = System.IO.File.OpenRead(response.PngThumbnailPath);
            
            // Add cache headers for thumbnail files - include version ID for proper cache invalidation
            var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            if (httpContext != null)
            {
                httpContext.Response.Headers.CacheControl = "public, max-age=86400"; // Cache for 24 hours
                // Include version ID in ETag to ensure cache invalidation when active version changes
                httpContext.Response.Headers.ETag = $"\"{id}-v{response.ActiveVersionId}-png-{response.ProcessedAt?.Ticks}\"";
            }
            
            return Results.File(fileStream, "image/png", enableRangeProcessing: true);
        })
        .WithName("Get Model PNG Thumbnail File")
        .WithTags("Thumbnails");

        // Version-specific thumbnail endpoints
        app.MapGet("/model-versions/{versionId}/thumbnail", async (
            int versionId, 
            IQueryHandler<GetVersionThumbnailQuery, GetVersionThumbnailQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetVersionThumbnailQuery(versionId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var response = result.Value;
            
            // Create response object with file URL if thumbnail is ready
            var thumbnailInfo = new
            {
                Status = response.Status.ToString(),
                FileUrl = response.Status == ThumbnailStatus.Ready && !string.IsNullOrEmpty(response.ThumbnailPath) 
                    ? $"/model-versions/{versionId}/thumbnail/file" 
                    : null,
                SizeBytes = response.SizeBytes,
                Width = response.Width,
                Height = response.Height,
                ErrorMessage = response.ErrorMessage,
                CreatedAt = response.CreatedAt,
                ProcessedAt = response.ProcessedAt
            };

            // Add cache headers for ready thumbnails
            if (response.Status == ThumbnailStatus.Ready)
            {
                var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
                if (httpContext != null)
                {
                    httpContext.Response.Headers.CacheControl = "public, max-age=3600"; // Cache for 1 hour
                    httpContext.Response.Headers.ETag = $"\"{versionId}-{response.ProcessedAt?.Ticks}\"";
                }
            }

            return Results.Ok(thumbnailInfo);
        })
        .WithName("Get Version Thumbnail Status")
        .WithTags("Thumbnails");

        app.MapGet("/model-versions/{versionId}/thumbnail/file", async (
            int versionId,
            IQueryHandler<GetVersionThumbnailQuery, GetVersionThumbnailQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetVersionThumbnailQuery(versionId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var response = result.Value;
            
            if (response.Status != ThumbnailStatus.Ready || string.IsNullOrEmpty(response.ThumbnailPath))
            {
                return Results.NotFound("Thumbnail not ready or not found");
            }

            // Ensure the directory exists before checking file existence
            var directory = Path.GetDirectoryName(response.ThumbnailPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            
            if (!System.IO.File.Exists(response.ThumbnailPath))
            {
                return Results.NotFound("Thumbnail file not found on disk");
            }

            var fileStream = System.IO.File.OpenRead(response.ThumbnailPath);
            var contentType = ContentTypeProvider.GetContentType(response.ThumbnailPath);
            
            // Add cache headers for thumbnail files
            var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            if (httpContext != null)
            {
                httpContext.Response.Headers.CacheControl = "public, max-age=86400"; // Cache for 24 hours
                httpContext.Response.Headers.ETag = $"\"{versionId}-{response.ProcessedAt?.Ticks}\"";
            }
            
            return Results.File(fileStream, contentType, enableRangeProcessing: true);
        })
        .WithName("Get Version Thumbnail File")
        .WithTags("Thumbnails");

        app.MapGet("/model-versions/{versionId}/thumbnail/png-file", async (
            int versionId,
            IQueryHandler<GetVersionThumbnailQuery, GetVersionThumbnailQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetVersionThumbnailQuery(versionId), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var response = result.Value;
            
            if (response.Status != ThumbnailStatus.Ready || string.IsNullOrEmpty(response.PngThumbnailPath))
            {
                return Results.NotFound("PNG thumbnail not ready or not found");
            }

            // Ensure the directory exists before checking file existence
            var directory = Path.GetDirectoryName(response.PngThumbnailPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            
            if (!System.IO.File.Exists(response.PngThumbnailPath))
            {
                return Results.NotFound("PNG thumbnail file not found on disk");
            }

            var fileStream = System.IO.File.OpenRead(response.PngThumbnailPath);
            
            // Add cache headers for thumbnail files
            var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            if (httpContext != null)
            {
                httpContext.Response.Headers.CacheControl = "public, max-age=86400"; // Cache for 24 hours
                httpContext.Response.Headers.ETag = $"\"{versionId}-png-{response.ProcessedAt?.Ticks}\"";
            }
            
            return Results.File(fileStream, "image/png", enableRangeProcessing: true);
        })
        .WithName("Get Version PNG Thumbnail File")
        .WithTags("Thumbnails");
    }

    private static Result ValidateThumbnailFile(IFormFile file, long maxThumbnailSizeBytes)
    {
        if (file == null || file.Length <= 0)
        {
            return Result.Failure(new Error("InvalidThumbnailFile", "Thumbnail file is empty or invalid."));
        }

        if (file.Length > maxThumbnailSizeBytes)
        {
            var maxSizeMB = maxThumbnailSizeBytes / 1_048_576;
            return Result.Failure(new Error("ThumbnailFileTooLarge", $"Thumbnail file size cannot exceed {maxSizeMB}MB."));
        }

        // Validate content type
        var contentType = file.ContentType?.ToLowerInvariant();
        if (contentType != "image/png" && contentType != "image/jpeg" && 
            contentType != "image/jpg" && contentType != "image/webp")
        {
            return Result.Failure(new Error("InvalidThumbnailFormat", 
                "Thumbnail must be a valid image file (png, jpg, jpeg, webp)."));
        }

        return Result.Success();
    }
}