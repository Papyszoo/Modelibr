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

        app.MapPost("/api/thumbnail-jobs/{jobId:int}/events", async (
            int jobId,
            [FromBody] LogJobEventRequest request,
            ICommandHandler<LogThumbnailJobEventCommand, LogThumbnailJobEventResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new LogThumbnailJobEventCommand(
                jobId,
                request.EventType,
                request.Message,
                request.Metadata,
                request.ErrorMessage), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(result.Error.Message);
            }

            return Results.Ok(new
            {
                EventId = result.Value.EventId,
                Message = "Event logged successfully"
            });
        })
        .WithName("Log Thumbnail Job Event")
        .WithTags("ThumbnailJobs");

        // Test endpoint to simulate thumbnail completion for testing SignalR
        app.MapPost("/api/test/thumbnail-complete/{modelId:int}", async (
            int modelId,
            [FromBody] TestThumbnailCompleteRequest request,
            Application.Abstractions.Services.IThumbnailNotificationService notificationService) =>
        {
            try
            {
                await notificationService.SendThumbnailStatusChangedAsync(
                    modelId,
                    request.Status,
                    request.ThumbnailUrl,
                    request.ErrorMessage);

                return Results.Ok(new { Message = "Test notification sent successfully" });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Error = ex.Message });
            }
        })
        .WithName("Test Thumbnail Complete Notification")
        .WithTags("Testing");
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

/// <summary>
/// Request model for logging thumbnail job events.
/// </summary>
public record LogJobEventRequest(string EventType, string Message, string? Metadata = null, string? ErrorMessage = null);

/// <summary>
/// Request model for testing thumbnail completion.
/// </summary>
public record TestThumbnailCompleteRequest(string Status, string? ThumbnailUrl = null, string? ErrorMessage = null);