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
/// Command to mark a thumbnail job as completed.
/// Called by the worker service when thumbnail generation finishes.
/// </summary>
public record CompleteThumbnailJobCommand(
    int JobId,
    string ThumbnailPath,
    long SizeBytes,
    int Width,
    int Height) : ICommand<CompleteThumbnailJobResponse>;

public record CompleteThumbnailJobResponse(int ModelId, int ModelVersionId, ThumbnailStatus Status);

/// <summary>
/// Handler for completing thumbnail jobs.
/// Updates the thumbnail entity and model, which triggers SignalR notifications.
/// </summary>
public class CompleteThumbnailJobCommandHandler : ICommandHandler<CompleteThumbnailJobCommand, CompleteThumbnailJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IDomainEventDispatcher _domainEventDispatcher;
    private readonly ILogger<CompleteThumbnailJobCommandHandler> _logger;

    public CompleteThumbnailJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IModelRepository modelRepository,
        IThumbnailRepository thumbnailRepository,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider,
        IDomainEventDispatcher domainEventDispatcher,
        ILogger<CompleteThumbnailJobCommandHandler> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
        _thumbnailRepository = thumbnailRepository ?? throw new ArgumentNullException(nameof(thumbnailRepository));
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _domainEventDispatcher = domainEventDispatcher ?? throw new ArgumentNullException(nameof(domainEventDispatcher));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<CompleteThumbnailJobResponse>> Handle(CompleteThumbnailJobCommand command, CancellationToken cancellationToken)
    {
        // Get the job
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Thumbnail job {JobId} not found", command.JobId);
            return Result.Failure<CompleteThumbnailJobResponse>(
                new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
        }

        // Get the model
        var model = await _modelRepository.GetByIdAsync(job.ModelId, cancellationToken);
        if (model == null)
        {
            _logger.LogWarning("Model {ModelId} not found for thumbnail job {JobId}", job.ModelId, command.JobId);
            return Result.Failure<CompleteThumbnailJobResponse>(
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

            // Mark thumbnail as ready - this will raise a domain event
            thumbnail.MarkAsReady(command.ThumbnailPath, command.SizeBytes, command.Width, command.Height, now);

            // Mark the job as completed
            await _thumbnailQueue.MarkCompletedAsync(command.JobId, cancellationToken);

            // Save changes
            await _thumbnailRepository.UpdateAsync(thumbnail, cancellationToken);

            // Dispatch domain events (including ThumbnailStatusChangedEvent)
            await _domainEventDispatcher.PublishAsync(thumbnail.DomainEvents, cancellationToken);
            thumbnail.ClearDomainEvents();

            _logger.LogInformation("Successfully completed thumbnail job {JobId} for model {ModelId} version {ModelVersionId}", 
                command.JobId, job.ModelId, job.ModelVersionId);

            return Result.Success(new CompleteThumbnailJobResponse(job.ModelId, job.ModelVersionId, ThumbnailStatus.Ready));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to complete thumbnail job {JobId} for model {ModelId} version {ModelVersionId}", 
                command.JobId, job.ModelId, job.ModelVersionId);

            return Result.Failure<CompleteThumbnailJobResponse>(
                new Error("ThumbnailJobCompletionFailed", 
                    $"Failed to complete thumbnail job {command.JobId}: {ex.Message}"));
        }
    }
}