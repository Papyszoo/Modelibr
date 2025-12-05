using Application.Abstractions.Messaging;
using Application.Thumbnails;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;
using WebApi.Files;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class ThumbnailEndpoints
{
    public static void MapThumbnailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/models/{id}/thumbnail", async (
            int id, 
            IQueryHandler<GetThumbnailStatusQuery, GetThumbnailStatusQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetThumbnailStatusQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
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
            ICommandHandler<RegenerateThumbnailCommand, RegenerateThumbnailCommandResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new RegenerateThumbnailCommand(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(result.Error.Message);
            }

            return Results.Ok(new { Message = "Thumbnail regeneration queued successfully", ModelId = result.Value.ModelId });
        })
        .WithName("Regenerate Thumbnail")
        .WithTags("Thumbnails");

        app.MapPost("/models/{id}/thumbnail/upload", async (
            int id,
            IFormFile file,
            [FromForm] int? width,
            [FromForm] int? height,
            ICommandHandler<UploadThumbnailCommand, UploadThumbnailCommandResponse> commandHandler,
            Application.Settings.ISettingsService settingsService) =>
        {
            var settings = await settingsService.GetSettingsAsync(CancellationToken.None);
            // Validate file
            var validationResult = ValidateThumbnailFile(file, settings.MaxThumbnailSizeBytes);
            if (!validationResult.IsSuccess)
            {
                return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
            }

            var command = new UploadThumbnailCommand(id, new FormFileUpload(file), width, height);
            var result = await commandHandler.Handle(command, CancellationToken.None);
            
            if (!result.IsSuccess)
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
        .DisableAntiforgery();

        app.MapGet("/models/{id}/thumbnail/file", async (
            int id,
            IQueryHandler<GetThumbnailStatusQuery, GetThumbnailStatusQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetThumbnailStatusQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
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

        app.MapGet("/models/{id}/classification-views/{viewName}", async (
            int id,
            string viewName,
            IConfiguration configuration) =>
        {
            // Get storage path from configuration
            var storagePath = configuration["THUMBNAIL_STORAGE_PATH"] ?? "/var/lib/modelibr/thumbnails";
            
            // Build path to classification view
            var classificationViewsDir = Path.Combine(storagePath, id.ToString(), "classification-views");
            var possibleFiles = Directory.Exists(classificationViewsDir)
                ? Directory.GetFiles(classificationViewsDir, $"{viewName}*.png")
                : Array.Empty<string>();
            
            if (possibleFiles.Length == 0)
            {
                return Results.NotFound($"Classification view '{viewName}' not found for model {id}");
            }
            
            var filePath = possibleFiles[0];
            
            if (!System.IO.File.Exists(filePath))
            {
                return Results.NotFound("Classification view file not found on disk");
            }

            var fileStream = System.IO.File.OpenRead(filePath);
            var contentType = "image/png";
            
            // Add cache headers for classification view files
            var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            if (httpContext != null)
            {
                httpContext.Response.Headers.CacheControl = "public, max-age=86400"; // Cache for 24 hours
                httpContext.Response.Headers.ETag = $"\"{id}-{viewName}\"";
            }
            
            return Results.File(fileStream, contentType, enableRangeProcessing: true);
        })
        .WithName("Get Classification View")
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