using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Domain.Events;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.EventHandlers;

/// <summary>
/// Handles ModelUploadedEvent by enqueueing a thumbnail generation job.
/// </summary>
public class ModelUploadedEventHandler : IDomainEventHandler<ModelUploadedEvent>
{
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<ModelUploadedEventHandler> _logger;

    public ModelUploadedEventHandler(
        IThumbnailQueue thumbnailQueue,
        ILogger<ModelUploadedEventHandler> logger)
    {
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result> Handle(ModelUploadedEvent domainEvent, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Handling ModelUploadedEvent for model {ModelId} version {ModelVersionId} with hash {ModelHash}, IsNewModel: {IsNewModel}",
                domainEvent.ModelId, domainEvent.ModelVersionId, domainEvent.ModelHash, domainEvent.IsNewModel);

            // Enqueue thumbnail generation job - the queue handles idempotency automatically
            var job = await _thumbnailQueue.EnqueueAsync(
                domainEvent.ModelId,
                domainEvent.ModelVersionId,
                domainEvent.ModelHash,
                cancellationToken: cancellationToken);

            _logger.LogInformation("Successfully enqueued thumbnail job {JobId} for model {ModelId} version {ModelVersionId} with status {Status}",
                job.Id, domainEvent.ModelId, domainEvent.ModelVersionId, job.Status);

            return Result.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue thumbnail job for model {ModelId} version {ModelVersionId} with hash {ModelHash}",
                domainEvent.ModelId, domainEvent.ModelVersionId, domainEvent.ModelHash);

            return Result.Failure(new Error("ThumbnailJobEnqueueFailed", 
                $"Failed to enqueue thumbnail job for model {domainEvent.ModelId} version {domainEvent.ModelVersionId}: {ex.Message}"));
        }
    }
}