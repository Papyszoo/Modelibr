using Application.Abstractions.Messaging;
using Application.ThumbnailJobs;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class ThumbnailJobEndpoints
{
    public static void MapThumbnailJobEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/thumbnail-jobs/dequeue", async (
            [FromBody] DequeueRequest request,
            ICommandHandler<DequeueThumbnailJobCommand, DequeueThumbnailJobResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new DequeueThumbnailJobCommand(request.WorkerId), cancellationToken);
            
            if (result.IsFailure)
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
                AssetType = response.Job.AssetType,
                ModelId = response.Job.ModelId,
                ModelVersionId = response.Job.ModelVersionId,
                ModelHash = response.Job.ModelHash,
                SoundId = response.Job.SoundId,
                SoundHash = response.Job.SoundHash,
                DefaultTextureSetId = response.Job.ModelVersion?.DefaultTextureSetId,
                Status = response.Job.Status.ToString(),
                AttemptCount = response.Job.AttemptCount,
                CreatedAt = response.Job.CreatedAt,
                UpdatedAt = response.Job.UpdatedAt
            });
        })
        .WithName("Dequeue Thumbnail Job")
        .WithTags("ThumbnailJobs");

        app.MapPost("/thumbnail-jobs/{jobId:int}/finish", async (
            int jobId,
            [FromBody] FinishJobRequest request,
            ICommandHandler<FinishThumbnailJobCommand, FinishThumbnailJobResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new FinishThumbnailJobCommand(
                jobId,
                request.Success,
                request.ThumbnailPath,
                request.SizeBytes,
                request.Width,
                request.Height,
                request.ErrorMessage), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(result.Error.Message);
            }

            return Results.Ok(new
            {
                result.Value.ModelId,
                result.Value.ModelVersionId,
                Status = result.Value.Status.ToString(),
                Message = request.Success ? "Thumbnail job completed successfully" : "Thumbnail job marked as failed"
            });
        })
        .WithName("Finish Thumbnail Job")
        .WithTags("ThumbnailJobs");

        app.MapPost("/thumbnail-jobs/sounds/{jobId:int}/finish", async (
            int jobId,
            [FromBody] FinishSoundJobRequest request,
            ICommandHandler<FinishSoundWaveformJobCommand, FinishSoundWaveformJobResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new FinishSoundWaveformJobCommand(
                jobId,
                request.Success,
                request.WaveformPath,
                request.SizeBytes,
                request.ErrorMessage), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(result.Error.Message);
            }

            return Results.Ok(new
            {
                result.Value.JobId,
                Status = result.Value.Status,
                Message = request.Success ? "Sound waveform job completed successfully" : "Sound waveform job marked as failed"
            });
        })
        .WithName("Finish Sound Waveform Job")
        .WithTags("ThumbnailJobs");

        app.MapPost("/thumbnail-jobs/{jobId:int}/events", async (
            int jobId,
            [FromBody] LogJobEventRequest request,
            ICommandHandler<LogThumbnailJobEventCommand, LogThumbnailJobEventResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new LogThumbnailJobEventCommand(
                jobId,
                request.EventType,
                request.Message,
                request.Metadata,
                request.ErrorMessage), cancellationToken);
            
            if (result.IsFailure)
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
        app.MapPost("/test/thumbnail-complete/{modelId:int}", async (
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
/// Request model for finishing sound waveform jobs (unified complete/fail).
/// </summary>
public record FinishSoundJobRequest(
    bool Success,
    string? WaveformPath = null,
    long? SizeBytes = null,
    string? ErrorMessage = null);

/// <summary>
/// Request model for logging thumbnail job events.
/// </summary>
public record LogJobEventRequest(string EventType, string Message, string? Metadata = null, string? ErrorMessage = null);

/// <summary>
/// Request model for testing thumbnail completion.
/// </summary>
public record TestThumbnailCompleteRequest(string Status, string? ThumbnailUrl = null, string? ErrorMessage = null);