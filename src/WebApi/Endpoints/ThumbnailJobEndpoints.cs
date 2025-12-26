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
                ModelVersionId = response.Job.ModelVersionId,
                ModelHash = response.Job.ModelHash,
                DefaultTextureSetId = response.Job.ModelVersion.DefaultTextureSetId,
                Status = response.Job.Status.ToString(),
                AttemptCount = response.Job.AttemptCount,
                CreatedAt = response.Job.CreatedAt,
                UpdatedAt = response.Job.UpdatedAt
            });
        })
        .WithName("Dequeue Thumbnail Job")
        .WithTags("ThumbnailJobs");

        app.MapPost("/api/thumbnail-jobs/{jobId:int}/finish", async (
            int jobId,
            [FromBody] FinishJobRequest request,
            ICommandHandler<FinishThumbnailJobCommand, FinishThumbnailJobResponse> commandHandler) =>
        {
            var result = await commandHandler.Handle(new FinishThumbnailJobCommand(
                jobId,
                request.Success,
                request.ThumbnailPath,
                request.SizeBytes,
                request.Width,
                request.Height,
                request.ErrorMessage), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.BadRequest(result.Error.Message);
            }

            return Results.Ok(new
            {
                ModelId = result.Value.ModelId,
                ModelVersionId = result.Value.ModelVersionId,
                Status = result.Value.Status.ToString(),
                Message = request.Success ? "Thumbnail job completed successfully" : "Thumbnail job marked as failed"
            });
        })
        .WithName("Finish Thumbnail Job")
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
/// Request model for finishing thumbnail jobs (unified complete/fail).
/// </summary>
public record FinishJobRequest(
    bool Success,
    string? ThumbnailPath = null,
    long? SizeBytes = null,
    int? Width = null,
    int? Height = null,
    string? ErrorMessage = null);

/// <summary>
/// Request model for logging thumbnail job events.
/// </summary>
public record LogJobEventRequest(string EventType, string Message, string? Metadata = null, string? ErrorMessage = null);

/// <summary>
/// Request model for testing thumbnail completion.
/// </summary>
public record TestThumbnailCompleteRequest(string Status, string? ThumbnailUrl = null, string? ErrorMessage = null);