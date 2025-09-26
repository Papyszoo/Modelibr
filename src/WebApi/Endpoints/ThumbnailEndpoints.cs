using Application.Abstractions.Messaging;
using Application.Thumbnails;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;
using WebApi.Files;

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

            // Add cache headers for ready thumbnails
            if (response.Status == ThumbnailStatus.Ready)
            {
                var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
                if (httpContext != null)
                {
                    httpContext.Response.Headers.CacheControl = "public, max-age=3600"; // Cache for 1 hour
                    httpContext.Response.Headers.ETag = $"\"{id}-{response.ProcessedAt?.Ticks}\"";
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
            ICommandHandler<UploadThumbnailCommand, UploadThumbnailCommandResponse> commandHandler) =>
        {
            // Validate file
            var validationResult = ValidateThumbnailFile(file);
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

            // Ensure the directory exists with proper permissions before checking file existence
            var directory = Path.GetDirectoryName(response.ThumbnailPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
                
                // Ensure the directory is accessible by testing write permissions
                // This handles cases where directory permissions were reset after container recreation
                try
                {
                    var dirInfo = new DirectoryInfo(directory);
                    if (dirInfo.Exists)
                    {
                        // Test write access by attempting to create and delete a temporary file
                        var testFile = Path.Combine(directory, $".access_test_{Guid.NewGuid():N}");
                        File.WriteAllText(testFile, "test");
                        File.Delete(testFile);
                    }
                }
                catch (UnauthorizedAccessException)
                {
                    return Results.Problem("Cannot access thumbnail directory due to permission issues", statusCode: 403);
                }
                catch (IOException)
                {
                    return Results.Problem("IO error accessing thumbnail directory", statusCode: 500);
                }
            }
            
            if (!System.IO.File.Exists(response.ThumbnailPath))
            {
                return Results.NotFound("Thumbnail file not found on disk");
            }

            var fileStream = System.IO.File.OpenRead(response.ThumbnailPath);
            var contentType = "image/png"; // Assuming PNG format for thumbnails
            
            // Add cache headers for thumbnail files
            var httpContext = ((IEndpointRouteBuilder)app).ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            if (httpContext != null)
            {
                httpContext.Response.Headers.CacheControl = "public, max-age=86400"; // Cache for 24 hours
                httpContext.Response.Headers.ETag = $"\"{id}-{response.ProcessedAt?.Ticks}\"";
            }
            
            return Results.File(fileStream, contentType, enableRangeProcessing: true);
        })
        .WithName("Get Thumbnail File")
        .WithTags("Thumbnails");
    }

    private static Result ValidateThumbnailFile(IFormFile file)
    {
        if (file == null || file.Length <= 0)
        {
            return Result.Failure(new Error("InvalidThumbnailFile", "Thumbnail file is empty or invalid."));
        }

        if (file.Length > 10_485_760) // 10MB
        {
            return Result.Failure(new Error("ThumbnailFileTooLarge", "Thumbnail file size cannot exceed 10MB."));
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