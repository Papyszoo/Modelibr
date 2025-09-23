using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Domain.Models;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

/// <summary>
/// Command to dequeue the next pending thumbnail job.
/// Called by worker services to get the next job to process.
/// </summary>
public record DequeueThumbnailJobCommand(string WorkerId) : ICommand<DequeueThumbnailJobResponse>;

public record DequeueThumbnailJobResponse(ThumbnailJob? Job);

/// <summary>
/// Handler for dequeuing thumbnail jobs.
/// </summary>
public class DequeueThumbnailJobCommandHandler : ICommandHandler<DequeueThumbnailJobCommand, DequeueThumbnailJobResponse>
{
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<DequeueThumbnailJobCommandHandler> _logger;

    public DequeueThumbnailJobCommandHandler(
        IThumbnailQueue thumbnailQueue,
        ILogger<DequeueThumbnailJobCommandHandler> logger)
    {
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<DequeueThumbnailJobResponse>> Handle(DequeueThumbnailJobCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var job = await _thumbnailQueue.DequeueAsync(command.WorkerId, cancellationToken);
            
            if (job != null)
            {
                _logger.LogInformation("Successfully dequeued thumbnail job {JobId} for worker {WorkerId}", 
                    job.Id, command.WorkerId);
            }
            else
            {
                _logger.LogDebug("No thumbnail jobs available for worker {WorkerId}", command.WorkerId);
            }

            return Result.Success(new DequeueThumbnailJobResponse(job));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to dequeue thumbnail job for worker {WorkerId}", command.WorkerId);

            return Result.Failure<DequeueThumbnailJobResponse>(
                new Error("ThumbnailJobDequeueFailed", 
                    $"Failed to dequeue thumbnail job for worker {command.WorkerId}: {ex.Message}"));
        }
    }
}