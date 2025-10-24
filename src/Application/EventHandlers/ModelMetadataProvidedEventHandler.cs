using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Events;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.EventHandlers;

/// <summary>
/// Handles ModelMetadataProvidedEvent by performing deduplication.
/// When model metadata (vertices) becomes available, this handler checks for duplicate models
/// with the same name and vertices count, and merges files into the first model found.
/// </summary>
public class ModelMetadataProvidedEventHandler : IDomainEventHandler<ModelMetadataProvidedEvent>
{
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IDomainEventDispatcher _domainEventDispatcher;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<ModelMetadataProvidedEventHandler> _logger;

    public ModelMetadataProvidedEventHandler(
        IModelRepository modelRepository,
        IThumbnailJobRepository thumbnailJobRepository,
        IBatchUploadRepository batchUploadRepository,
        IDomainEventDispatcher domainEventDispatcher,
        IDateTimeProvider dateTimeProvider,
        ILogger<ModelMetadataProvidedEventHandler> logger)
    {
        _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _batchUploadRepository = batchUploadRepository ?? throw new ArgumentNullException(nameof(batchUploadRepository));
        _domainEventDispatcher = domainEventDispatcher ?? throw new ArgumentNullException(nameof(domainEventDispatcher));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result> Handle(ModelMetadataProvidedEvent domainEvent, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation(
                "Handling ModelMetadataProvidedEvent for model {ModelId} with name '{ModelName}', vertices: {Vertices}, faces: {Faces}",
                domainEvent.ModelId, domainEvent.ModelName, domainEvent.Vertices, domainEvent.Faces);

            // Only perform deduplication if we have vertices count
            if (!domainEvent.Vertices.HasValue)
            {
                _logger.LogInformation(
                    "Skipping deduplication for model {ModelId} - no vertices count available",
                    domainEvent.ModelId);
                return Result.Success();
            }

            // Find ALL models with same name and vertices count (including hidden ones for deduplication)
            var duplicateModels = await _modelRepository.GetAllByNameAndVerticesAsync(
                domainEvent.ModelName,
                domainEvent.Vertices.Value,
                cancellationToken);

            var duplicatesList = duplicateModels.ToList();
            
            // If we found multiple models with same name+vertices, we need to merge them
            if (duplicatesList.Count > 1)
            {
                _logger.LogInformation(
                    "Found {Count} models with name '{ModelName}' and {Vertices} vertices. Merging files...",
                    duplicatesList.Count, domainEvent.ModelName, domainEvent.Vertices);

                // Keep the VISIBLE model with the lowest ID if one exists, otherwise keep the first hidden one
                var visibleModel = duplicatesList.Where(m => !m.IsHidden).OrderBy(m => m.Id).FirstOrDefault();
                var modelToKeep = visibleModel ?? duplicatesList.OrderBy(m => m.Id).First();
                var modelsToMerge = duplicatesList.Where(m => m.Id != modelToKeep.Id).ToList();

                _logger.LogInformation(
                    "Keeping model {KeepModelId} (IsHidden: {IsHidden}) and merging {Count} duplicate models",
                    modelToKeep.Id, modelToKeep.IsHidden, modelsToMerge.Count);

                // Merge files from all duplicate models into the one to keep
                foreach (var modelToMerge in modelsToMerge)
                {
                    _logger.LogInformation(
                        "Merging files from model {MergeModelId} (IsHidden: {IsHidden}) into model {KeepModelId}",
                        modelToMerge.Id, modelToMerge.IsHidden, modelToKeep.Id);

                    foreach (var file in modelToMerge.Files.ToList())
                    {
                        // Check if the file doesn't already exist in the target model
                        if (!modelToKeep.HasFile(file.Sha256Hash))
                        {
                            _logger.LogInformation(
                                "Moving file {FileId} (hash: {FileHash}) from model {MergeModelId} to model {KeepModelId}",
                                file.Id, file.Sha256Hash, modelToMerge.Id, modelToKeep.Id);
                            
                            // Link existing file to the model (don't try to insert it again)
                            await _modelRepository.LinkExistingFileAsync(modelToKeep.Id, file, cancellationToken);
                        }
                        else
                        {
                            _logger.LogInformation(
                                "File {FileId} (hash: {FileHash}) already exists in model {KeepModelId}, skipping",
                                file.Id, file.Sha256Hash, modelToKeep.Id);
                        }
                    }
                    
                    // Update batch upload history records to point to the kept model
                    _logger.LogInformation(
                        "Updating batch upload history records from model {MergeModelId} to model {KeepModelId}",
                        modelToMerge.Id, modelToKeep.Id);
                    
                    try
                    {
                        await _batchUploadRepository.UpdateModelIdForModelAsync(modelToMerge.Id, modelToKeep.Id, cancellationToken);
                        _logger.LogInformation(
                            "Batch upload history records updated for model {MergeModelId}",
                            modelToMerge.Id);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "Failed to update batch upload history for model {MergeModelId}, continuing",
                            modelToMerge.Id);
                    }
                    
                    // Cancel thumbnail job for the duplicate model before deleting
                    _logger.LogInformation(
                        "Cancelling thumbnail job for duplicate model {MergeModelId} before deletion",
                        modelToMerge.Id);
                    
                    try
                    {
                        await _thumbnailJobRepository.CancelJobForModelAsync(modelToMerge.Id, cancellationToken);
                        _logger.LogInformation(
                            "Thumbnail job cancelled for model {MergeModelId}",
                            modelToMerge.Id);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "Failed to cancel thumbnail job for model {MergeModelId}, continuing with deletion",
                            modelToMerge.Id);
                    }
                    
                    // Delete the duplicate model after all files have been moved and job cancelled
                    _logger.LogInformation(
                        "Deleting duplicate model {MergeModelId} after file migration and job cancellation",
                        modelToMerge.Id);
                    await _modelRepository.DeleteAsync(modelToMerge.Id, cancellationToken);
                }

                // If the kept model is still hidden, show it now (deduplication complete)
                if (modelToKeep.IsHidden)
                {
                    _logger.LogInformation(
                        "Showing model {KeepModelId} after deduplication complete",
                        modelToKeep.Id);
                    
                    // Fetch the full model with all relationships to get domain events
                    var modelToShow = await _modelRepository.GetByIdAsync(modelToKeep.Id, cancellationToken);
                    if (modelToShow != null)
                    {
                        // Call Show() to raise ModelShownEvent
                        modelToShow.Show(_dateTimeProvider.UtcNow);
                        
                        // Save the model with IsHidden=false
                        await _modelRepository.UpdateAsync(modelToShow, cancellationToken);
                        
                        // Publish domain events (ModelShownEvent triggers thumbnail generation)
                        if (modelToShow.DomainEvents.Any())
                        {
                            _logger.LogInformation(
                                "Publishing {Count} domain events for shown model {ModelId}",
                                modelToShow.DomainEvents.Count(), modelToShow.Id);
                            await _domainEventDispatcher.PublishAsync(modelToShow.DomainEvents, cancellationToken);
                            modelToShow.ClearDomainEvents();
                            await _modelRepository.UpdateAsync(modelToShow, cancellationToken);
                        }
                    }
                }

                _logger.LogInformation(
                    "Successfully merged and deleted duplicate models. Kept model {KeepModelId}. Deleted models: {DeletedModelIds}",
                    modelToKeep.Id, string.Join(", ", modelsToMerge.Select(m => m.Id)));
            }
            else
            {
                // No duplicates found - this is a unique model
                // Show the model to make it visible to users (deduplication complete)
                var model = duplicatesList.FirstOrDefault();
                if (model != null && model.IsHidden)
                {
                    _logger.LogInformation(
                        "No duplicates found for model {ModelId}. Showing model to users (deduplication complete).",
                        model.Id);
                    
                    // Call Show() to raise ModelShownEvent
                    model.Show(_dateTimeProvider.UtcNow);
                    
                    // Save the model with IsHidden=false
                    await _modelRepository.UpdateAsync(model, cancellationToken);
                    
                    // Publish domain events (ModelShownEvent triggers thumbnail generation)
                    if (model.DomainEvents.Any())
                    {
                        _logger.LogInformation(
                            "Publishing {Count} domain events for shown model {ModelId}",
                            model.DomainEvents.Count(), model.Id);
                        await _domainEventDispatcher.PublishAsync(model.DomainEvents, cancellationToken);
                        model.ClearDomainEvents();
                        await _modelRepository.UpdateAsync(model, cancellationToken);
                    }
                }
                
                _logger.LogInformation(
                    "No duplicate models found for model {ModelId} with name '{ModelName}' and {Vertices} vertices",
                    domainEvent.ModelId, domainEvent.ModelName, domainEvent.Vertices);
            }

            return Result.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to handle ModelMetadataProvidedEvent for model {ModelId}",
                domainEvent.ModelId);

            return Result.Failure(new Error("DeduplicationFailed",
                $"Failed to deduplicate model {domainEvent.ModelId}: {ex.Message}"));
        }
    }
}
