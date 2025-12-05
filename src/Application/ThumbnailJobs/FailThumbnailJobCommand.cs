using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
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

public record FailThumbnailJobResponse(int ModelId, int ModelVersionId, ThumbnailStatus Status);

/// <summary>
/// Handler for failing thumbnail jobs.
/// Updates the thumbnail entity and job status, which triggers SignalR notifications.
/// </summary>
public class FailThumbnailJobCommandHandler : ICommandHandler<FailThumbnailJobCommand, FailThumbnailJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<FailThumbnailJobCommandHandler> _logger;

    public FailThumbnailJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IModelRepository modelRepository,
        IThumbnailRepository thumbnailRepository,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider,
        ILogger<FailThumbnailJobCommandHandler> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
        _thumbnailRepository = thumbnailRepository ?? throw new ArgumentNullException(nameof(thumbnailRepository));
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<FailThumbnailJobResponse>> Handle(FailThumbnailJobCommand command, CancellationToken cancellationToken)
    {
        // Get the job
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Thumbnail job {JobId} not found", command.JobId);
            return Result.Failure<FailThumbnailJobResponse>(
                new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
        }

        // Get the model
        var model = await _modelRepository.GetByIdAsync(job.ModelId, cancellationToken);
        if (model == null)
        {
            _logger.LogWarning("Model {ModelId} not found for thumbnail job {JobId}", job.ModelId, command.JobId);
            return Result.Failure<FailThumbnailJobResponse>(
                new Error("ModelNotFound", $"Model {job.ModelId} not found"));
        }

        var now = _dateTimeProvider.UtcNow;

        try
        {
            // Get or create the thumbnail entity for this version
            var thumbnail = await _thumbnailRepository.GetByModelVersionIdAsync(job.ModelVersionId, cancellationToken);
            if (thumbnail == null)
            {
                thumbnail = Thumbnail.Create(job.ModelVersionId, now);
                thumbnail = await _thumbnailRepository.AddAsync(thumbnail, cancellationToken);
            }

            // Mark thumbnail as failed - this will raise a domain event
            thumbnail.MarkAsFailed(command.ErrorMessage, now);

            // Mark the job as failed (handles retry logic and dead letter queue)
            await _thumbnailQueue.MarkFailedAsync(command.JobId, command.ErrorMessage, cancellationToken);

            // Save changes - the domain event will be dispatched automatically
            await _thumbnailRepository.UpdateAsync(thumbnail, cancellationToken);

            _logger.LogInformation("Successfully marked thumbnail job {JobId} as failed for model {ModelId} version {ModelVersionId}: {ErrorMessage}", 
                command.JobId, job.ModelId, job.ModelVersionId, command.ErrorMessage);

            return Result.Success(new FailThumbnailJobResponse(job.ModelId, job.ModelVersionId, ThumbnailStatus.Failed));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mark thumbnail job {JobId} as failed for model {ModelId} version {ModelVersionId}", 
                command.JobId, job.ModelId, job.ModelVersionId);

            return Result.Failure<FailThumbnailJobResponse>(
                new Error("ThumbnailJobFailureFailed", 
                    $"Failed to mark thumbnail job {command.JobId} as failed: {ex.Message}"));
        }
    }
}
