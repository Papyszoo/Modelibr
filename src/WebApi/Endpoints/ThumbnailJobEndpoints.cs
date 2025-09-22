using Application.Abstractions.Messaging;
using Application.ThumbnailJobs;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class ThumbnailJobEndpoints
{
    public static void MapThumbnailJobEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/thumbnail-jobs/dequeue", async (
            [FromBody] DequeueRequest request,
            ICommandHandler<DequeueThumbnailJobCommand, DequeueThumbnailJobResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new DequeueThumbnailJobCommand(request.WorkerId), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(result.Error.Message);
            }

            var response = result.Value;
            
            if (response.Job == null)
            {
                return Results.NoContent(); // HTTP 204 - No jobs available
            }

            return Results.Ok(new
            {
                Id = response.Job.Id,
                ModelId = response.Job.ModelId,
                ModelHash = response.Job.ModelHash,
                Status = response.Job.Status.ToString(),
                AttemptCount = response.Job.AttemptCount,
                CreatedAt = response.Job.CreatedAt,
                UpdatedAt = response.Job.UpdatedAt
            });
        })
        .WithName("Dequeue Thumbnail Job")
        .WithTags("ThumbnailJobs");

        app.MapPost("/api/thumbnail-jobs/{jobId:int}/complete", async (
            int jobId,
            [FromBody] CompleteJobRequest request,
            ICommandHandler<CompleteThumbnailJobCommand, CompleteThumbnailJobResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new CompleteThumbnailJobCommand(
                jobId,
                request.ThumbnailPath,
                request.SizeBytes,
                request.Width,
                request.Height), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(result.Error.Message);
            }

            return Results.Ok(new
            {
                ModelId = result.Value.ModelId,
                Status = result.Value.Status.ToString(),
                Message = "Thumbnail job completed successfully"
            });
        })
        .WithName("Complete Thumbnail Job")
        .WithTags("ThumbnailJobs");
    }
}

/// <summary>
/// Request model for dequeuing thumbnail jobs.
/// </summary>
public record DequeueRequest(string WorkerId);

/// <summary>
/// Request model for completing thumbnail jobs.
/// </summary>
public record CompleteJobRequest(string ThumbnailPath, long SizeBytes, int Width, int Height);