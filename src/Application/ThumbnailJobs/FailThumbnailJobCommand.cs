using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

/// <summary>
/// Command to mark a thumbnail job as failed.
/// Called by the worker service when thumbnail generation fails.
/// </summary>
public record FailThumbnailJobCommand(
    int JobId,
    string ErrorMessage) : ICommand<FailThumbnailJobResponse>;

public record FailThumbnailJobResponse(int JobId, string Status);

/// <summary>
/// Handler for marking thumbnail jobs as failed.
/// </summary>
public class FailThumbnailJobCommandHandler : ICommandHandler<FailThumbnailJobCommand, FailThumbnailJobResponse>
{
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<FailThumbnailJobCommandHandler> _logger;

    public FailThumbnailJobCommandHandler(
        IThumbnailQueue thumbnailQueue,
        ILogger<FailThumbnailJobCommandHandler> logger)
    {
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<FailThumbnailJobResponse>> Handle(FailThumbnailJobCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the job to verify it exists
            var job = await _thumbnailQueue.GetJobAsync(command.JobId, cancellationToken);
            if (job == null)
            {
                _logger.LogWarning("Thumbnail job {JobId} not found", command.JobId);
                return Result.Failure<FailThumbnailJobResponse>(
                    new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
            }

            // Mark the job as failed
            await _thumbnailQueue.MarkFailedAsync(command.JobId, command.ErrorMessage, cancellationToken);

            _logger.LogInformation("Successfully marked thumbnail job {JobId} as failed with error: {ErrorMessage}", 
                command.JobId, command.ErrorMessage);

            return Result.Success(new FailThumbnailJobResponse(command.JobId, "Failed"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mark thumbnail job {JobId} as failed", command.JobId);

            return Result.Failure<FailThumbnailJobResponse>(
                new Error("ThumbnailJobFailureFailed", 
                    $"Failed to mark thumbnail job {command.JobId} as failed: {ex.Message}"));
        }
    }
}