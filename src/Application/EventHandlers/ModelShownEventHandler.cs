using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Events;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.EventHandlers;

/// <summary>
/// Handles ModelShownEvent by enqueueing a thumbnail generation job.
/// This event is raised when a model becomes visible to users after deduplication is complete.
/// </summary>
public class ModelShownEventHandler : IDomainEventHandler<ModelShownEvent>
{
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IModelRepository _modelRepository;
    private readonly ILogger<ModelShownEventHandler> _logger;

    public ModelShownEventHandler(
        IThumbnailQueue thumbnailQueue,
        IModelRepository modelRepository,
        ILogger<ModelShownEventHandler> logger)
    {
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result> Handle(ModelShownEvent domainEvent, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Handling ModelShownEvent for model {ModelId}", domainEvent.ModelId);

            // Get the model to get the file hash for thumbnail generation
            var model = await _modelRepository.GetByIdAsync(domainEvent.ModelId, cancellationToken);
            if (model == null)
            {
                _logger.LogWarning("Model {ModelId} not found when handling ModelShownEvent", domainEvent.ModelId);
                return Result.Failure(new Error("ModelNotFound", $"Model {domainEvent.ModelId} not found"));
            }

            // Get the first renderable file to generate thumbnail
            var renderableFile = model.Files.FirstOrDefault(f => f.FileType.IsRenderable);
            if (renderableFile == null)
            {
                _logger.LogWarning("No renderable file found for model {ModelId}", domainEvent.ModelId);
                return Result.Success(); // Not an error, just skip thumbnail generation
            }

            // Enqueue thumbnail generation job
            var job = await _thumbnailQueue.EnqueueAsync(
                domainEvent.ModelId,
                renderableFile.Sha256Hash,
                cancellationToken: cancellationToken);

            _logger.LogInformation("Successfully enqueued thumbnail job {JobId} for model {ModelId} with status {Status}",
                job.Id, domainEvent.ModelId, job.Status);

            return Result.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue thumbnail job for model {ModelId}",
                domainEvent.ModelId);

            return Result.Failure(new Error("ThumbnailJobEnqueueFailed", 
                $"Failed to enqueue thumbnail job for model {domainEvent.ModelId}: {ex.Message}"));
        }
    }
}
