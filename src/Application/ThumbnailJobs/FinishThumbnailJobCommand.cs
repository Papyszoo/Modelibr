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
/// Command to finish a thumbnail job (either completed or failed).
/// Called by the worker service when thumbnail generation finishes.
/// </summary>
public record FinishThumbnailJobCommand(
    int JobId,
    bool Success,
    // Success fields (nullable - required when Success=true)
    string? ThumbnailPath,
    long? SizeBytes,
    int? Width,
    int? Height,
    // Failure fields (nullable - required when Success=false)
    string? ErrorMessage) : ICommand<FinishThumbnailJobResponse>;

public record FinishThumbnailJobResponse(int ModelId, int ModelVersionId, ThumbnailStatus Status);

/// <summary>
/// Handler for finishing thumbnail jobs.
/// Unifies the logic from CompleteThumbnailJobCommand and FailThumbnailJobCommand.
/// </summary>
public class FinishThumbnailJobCommandHandler : ICommandHandler<FinishThumbnailJobCommand, FinishThumbnailJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IDomainEventDispatcher _domainEventDispatcher;
    private readonly ILogger<FinishThumbnailJobCommandHandler> _logger;

    public FinishThumbnailJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IModelRepository modelRepository,
        IThumbnailRepository thumbnailRepository,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider,
        IDomainEventDispatcher domainEventDispatcher,
        ILogger<FinishThumbnailJobCommandHandler> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
        _thumbnailRepository = thumbnailRepository ?? throw new ArgumentNullException(nameof(thumbnailRepository));
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _domainEventDispatcher = domainEventDispatcher ?? throw new ArgumentNullException(nameof(domainEventDispatcher));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<FinishThumbnailJobResponse>> Handle(FinishThumbnailJobCommand command, CancellationToken cancellationToken)
    {
        // Validate command
        if (command.Success)
        {
            if (string.IsNullOrEmpty(command.ThumbnailPath))
            {
                return Result.Failure<FinishThumbnailJobResponse>(
                    new Error("InvalidCommand", "ThumbnailPath is required when Success is true"));
            }
        }
        else
        {
            if (string.IsNullOrEmpty(command.ErrorMessage))
            {
                return Result.Failure<FinishThumbnailJobResponse>(
                    new Error("InvalidCommand", "ErrorMessage is required when Success is false"));
            }
        }

        // Get the job
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Thumbnail job {JobId} not found", command.JobId);
            return Result.Failure<FinishThumbnailJobResponse>(
                new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
        }

        var now = _dateTimeProvider.UtcNow;

        // Verify this is a model job (not sound job)
        if (!job.ModelId.HasValue || !job.ModelVersionId.HasValue)
        {
            _logger.LogWarning("Job {JobId} is not a model thumbnail job - use FinishSoundWaveformJobCommand instead", command.JobId);
            return Result.Failure<FinishThumbnailJobResponse>(
                new Error("InvalidJobType", "Job must have ModelId and ModelVersionId. Use FinishSoundWaveformJobCommand for sound jobs"));
        }

        // Get the model
        var model = await _modelRepository.GetByIdAsync(job.ModelId.Value, cancellationToken);
        if (model == null)
        {
            _logger.LogWarning("Model {ModelId} not found for thumbnail job {JobId}", job.ModelId, command.JobId);
            return Result.Failure<FinishThumbnailJobResponse>(
                new Error("ModelNotFound", $"Model {job.ModelId} not found"));
        }

        try
        {
            // Get or create the thumbnail entity for this version
            var thumbnail = await _thumbnailRepository.GetByModelVersionIdAsync(job.ModelVersionId.Value, cancellationToken);
            if (thumbnail == null)
            {
                thumbnail = Thumbnail.Create(job.ModelVersionId.Value, now);
                thumbnail = await _thumbnailRepository.AddAsync(thumbnail, cancellationToken);
                
                // Set ThumbnailId on the ModelVersion
                var targetVersion = model.Versions.FirstOrDefault(v => v.Id == job.ModelVersionId.Value);
                if (targetVersion != null)
                {
                    targetVersion.SetThumbnail(thumbnail);
                    await _modelRepository.UpdateAsync(model, cancellationToken);
                }
            }

            ThumbnailStatus status;
            if (command.Success)
            {
                // Mark thumbnail as ready
                thumbnail.MarkAsReady(
                    command.ThumbnailPath!, 
                    command.SizeBytes ?? 0, 
                    command.Width ?? 256, 
                    command.Height ?? 256, 
                    now);
                status = ThumbnailStatus.Ready;
                
                // Mark the job as completed
                await _thumbnailQueue.MarkCompletedAsync(command.JobId, cancellationToken);
                
                _logger.LogInformation("Successfully completed thumbnail job {JobId} for model {ModelId} version {ModelVersionId}", 
                    command.JobId, job.ModelId, job.ModelVersionId);
            }
            else
            {
                // Mark thumbnail as failed
                thumbnail.MarkAsFailed(command.ErrorMessage!, now);
                status = ThumbnailStatus.Failed;
                
                // Mark the job as failed (handles retry logic and dead letter queue)
                await _thumbnailQueue.MarkFailedAsync(command.JobId, command.ErrorMessage!, cancellationToken);
                
                _logger.LogInformation("Marked thumbnail job {JobId} as failed for model {ModelId} version {ModelVersionId}: {ErrorMessage}", 
                    command.JobId, job.ModelId, job.ModelVersionId, command.ErrorMessage);
            }

            // Save changes
            await _thumbnailRepository.UpdateAsync(thumbnail, cancellationToken);

            // Dispatch domain events (including ThumbnailStatusChangedEvent)
            await _domainEventDispatcher.PublishAsync(thumbnail.DomainEvents, cancellationToken);
            thumbnail.ClearDomainEvents();

            return Result.Success(new FinishThumbnailJobResponse(job.ModelId.Value, job.ModelVersionId.Value, status));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to finish thumbnail job {JobId} for model {ModelId} version {ModelVersionId}", 
                command.JobId, job.ModelId, job.ModelVersionId);

            return Result.Failure<FinishThumbnailJobResponse>(
                new Error("ThumbnailJobFinishFailed", 
                    $"Failed to finish thumbnail job {command.JobId}: {ex.Message}"));
        }
    }
}
