using Application.Abstractions.Messaging;
using Application.Thumbnails;
using Domain.ValueObjects;
using Microsoft.AspNetCore.Mvc;

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
}