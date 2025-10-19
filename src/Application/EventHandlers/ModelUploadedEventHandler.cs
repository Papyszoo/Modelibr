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
            _logger.LogInformation("Handling ModelUploadedEvent for model {ModelId} with hash {ModelHash}, IsNewModel: {IsNewModel}",
                domainEvent.ModelId, domainEvent.ModelHash, domainEvent.IsNewModel);

            // Note: We no longer enqueue thumbnail jobs here.
            // Thumbnail generation is now triggered by ModelShownEvent after deduplication is complete.
            // This prevents generating thumbnails for models that might be deleted during deduplication.
            _logger.LogInformation("Skipping thumbnail generation for model {ModelId} - will be triggered after deduplication via ModelShownEvent",
                domainEvent.ModelId);

            return Result.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle ModelUploadedEvent for model {ModelId} with hash {ModelHash}",
                domainEvent.ModelId, domainEvent.ModelHash);

            return Result.Failure(new Error("ModelUploadedEventHandlingFailed", 
                $"Failed to handle ModelUploadedEvent for model {domainEvent.ModelId}: {ex.Message}"));
        }
    }
}