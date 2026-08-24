using Application.Abstractions.Messaging;
using Application.ThumbnailJobs;
using Microsoft.AspNetCore.Mvc;
using WebApi.Infrastructure;

namespace WebApi.Endpoints;

/// <summary>
/// The job lifecycle a worker drives: claim a job, report it finished, log what happened
/// on the way.
///
/// <b>Every route here is worker-facing and carries <see cref="WorkerApiKeyFilter"/>.</b>
/// These are not read endpoints - a caller that can reach them can claim work meant for a
/// real worker, or declare an in-flight job complete or failed on its behalf, which lands
/// an asset with a permanently missing thumbnail or a scene render that never happened.
/// The upload half of the same conversation (render-upload, thumbnail upload) was already
/// behind the filter; the finish half was not, which meant the cheap way to disrupt the
/// pipeline was left open while the expensive one was shut.
/// </summary>
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
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
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
                TextureSetId = response.Job.TextureSetId,
                EnvironmentMapId = response.Job.EnvironmentMapId,
                EnvironmentMapVariantId = response.Job.EnvironmentMapVariantId,
                SceneId = response.Job.SceneId,
                SceneViewpoint = response.Job.SceneViewpoint,
                DefaultTextureSetId = response.Job.ModelVersion?.DefaultTextureSetId,
                MainVariantName = response.Job.ModelVersion?.MainVariantName ?? "",
                TextureMappings = response.Job.ModelVersion?.TextureMappings?.Select(tm => new
                {
                    tm.MaterialName,
                    tm.TextureSetId,
                    tm.VariantName,
                }).ToArray() ?? Array.Empty<object>(),
                Status = response.Job.Status.ToString(),
                AttemptCount = response.Job.AttemptCount,
                CreatedAt = response.Job.CreatedAt,
                UpdatedAt = response.Job.UpdatedAt
            });
        })
        .WithName("Dequeue Thumbnail Job")
        .WithTags("ThumbnailJobs")
        .AddEndpointFilter<WorkerApiKeyFilter>();

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
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
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
        .WithTags("ThumbnailJobs")
        .AddEndpointFilter<WorkerApiKeyFilter>();

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
                request.Duration,
                request.SampleRate,
                request.Channels,
                request.Format,
                request.ErrorMessage), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new
            {
                result.Value.JobId,
                Status = result.Value.Status,
                Message = request.Success ? "Sound waveform job completed successfully" : "Sound waveform job marked as failed"
            });
        })
        .WithName("Finish Sound Waveform Job")
        .WithTags("ThumbnailJobs")
        .AddEndpointFilter<WorkerApiKeyFilter>();

        app.MapPost("/thumbnail-jobs/texture-sets/{jobId:int}/finish", async (
            int jobId,
            [FromBody] FinishTextureSetJobRequest request,
            ICommandHandler<FinishTextureSetThumbnailJobCommand, FinishTextureSetThumbnailJobResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new FinishTextureSetThumbnailJobCommand(
                jobId,
                request.Success,
                request.ThumbnailPath,
                request.SizeBytes,
                request.ErrorMessage), cancellationToken);

            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new
            {
                result.Value.JobId,
                Status = result.Value.Status,
                Message = request.Success ? "Texture set thumbnail job completed successfully" : "Texture set thumbnail job marked as failed"
            });
        })
        .WithName("Finish Texture Set Thumbnail Job")
        .WithTags("ThumbnailJobs")
        .AddEndpointFilter<WorkerApiKeyFilter>();

        app.MapPost("/thumbnail-jobs/scenes/{jobId:int}/finish", async (
            int jobId,
            [FromBody] FinishSceneRenderJobRequest request,
            ICommandHandler<FinishSceneRenderJobCommand, FinishSceneRenderJobResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new FinishSceneRenderJobCommand(
                jobId,
                request.Success,
                request.ErrorMessage), cancellationToken);

            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new
            {
                result.Value.JobId,
                result.Value.SceneId,
                result.Value.Status,
                Message = request.Success ? "Scene render job completed successfully" : "Scene render job marked as failed"
            });
        })
        .WithName("Finish Scene Render Job")
        .WithTags("ThumbnailJobs")
        .AddEndpointFilter<WorkerApiKeyFilter>();

        app.MapPost("/thumbnail-jobs/environment-maps/{jobId:int}/finish", async (
            int jobId,
            [FromBody] FinishEnvironmentMapJobRequest request,
            ICommandHandler<FinishEnvironmentMapThumbnailJobCommand, FinishEnvironmentMapThumbnailJobResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await commandHandler.Handle(new FinishEnvironmentMapThumbnailJobCommand(
                jobId,
                request.Success,
                request.ThumbnailPath,
                request.ErrorMessage), cancellationToken);

            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new
            {
                result.Value.JobId,
                result.Value.EnvironmentMapId,
                result.Value.EnvironmentMapVariantId,
                result.Value.Status,
                Message = request.Success ? "Environment map thumbnail job completed successfully" : "Environment map thumbnail job marked as failed"
            });
        })
        .WithName("Finish Environment Map Thumbnail Job")
        .WithTags("ThumbnailJobs")
        .AddEndpointFilter<WorkerApiKeyFilter>();

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
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(new
            {
                EventId = result.Value.EventId,
                Message = "Event logged successfully"
            });
        })
        .WithName("Log Thumbnail Job Event")
        .WithTags("ThumbnailJobs")
        .AddEndpointFilter<WorkerApiKeyFilter>();

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
                    request.ModelVersionId,
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
    double? Duration = null,
    int? SampleRate = null,
    int? Channels = null,
    string? Format = null,
    string? ErrorMessage = null);

/// <summary>
/// Request model for finishing texture set thumbnail jobs (unified complete/fail).
/// </summary>
public record FinishTextureSetJobRequest(
    bool Success,
    string? ThumbnailPath = null,
    long? SizeBytes = null,
    string? ErrorMessage = null);

public record FinishEnvironmentMapJobRequest(
    bool Success,
    string? ThumbnailPath = null,
    string? ErrorMessage = null);

/// <summary>
/// No path or size here, unlike its neighbours: the render's bytes and dimensions were
/// already recorded by the upload that preceded this call, so repeating them would give
/// the worker a second chance to disagree with itself.
/// </summary>
public record FinishSceneRenderJobRequest(
    bool Success,
    string? ErrorMessage = null);

/// <summary>
/// Request model for logging thumbnail job events.
/// </summary>
public record LogJobEventRequest(string EventType, string Message, string? Metadata = null, string? ErrorMessage = null);

/// <summary>
/// Request model for testing thumbnail completion.
/// </summary>
public record TestThumbnailCompleteRequest(int ModelVersionId, string Status, string? ThumbnailUrl = null, string? ErrorMessage = null);
