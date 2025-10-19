using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Events;
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
    private readonly ILogger<ModelMetadataProvidedEventHandler> _logger;

    public ModelMetadataProvidedEventHandler(
        IModelRepository modelRepository,
        ILogger<ModelMetadataProvidedEventHandler> logger)
    {
        _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
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

            // Find ALL models with same name and vertices count
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

                // Keep the model with the lowest ID (created first)
                var modelToKeep = duplicatesList.OrderBy(m => m.Id).First();
                var modelsToMerge = duplicatesList.Where(m => m.Id != modelToKeep.Id).ToList();

                _logger.LogInformation(
                    "Keeping model {KeepModelId} and merging {Count} duplicate models",
                    modelToKeep.Id, modelsToMerge.Count);

                // Merge files from all duplicate models into the one to keep
                foreach (var modelToMerge in modelsToMerge)
                {
                    _logger.LogInformation(
                        "Merging files from model {MergeModelId} into model {KeepModelId}",
                        modelToMerge.Id, modelToKeep.Id);

                    foreach (var file in modelToMerge.Files.ToList())
                    {
                        // Check if the file doesn't already exist in the target model
                        if (!modelToKeep.HasFile(file.Sha256Hash))
                        {
                            _logger.LogInformation(
                                "Moving file {FileId} (hash: {FileHash}) from model {MergeModelId} to model {KeepModelId}",
                                file.Id, file.Sha256Hash, modelToMerge.Id, modelToKeep.Id);
                            
                            await _modelRepository.AddFileAsync(modelToKeep.Id, file, cancellationToken);
                        }
                        else
                        {
                            _logger.LogInformation(
                                "File {FileId} (hash: {FileHash}) already exists in model {KeepModelId}, skipping",
                                file.Id, file.Sha256Hash, modelToKeep.Id);
                        }
                    }
                }

                _logger.LogInformation(
                    "Successfully merged files into model {KeepModelId}. Merged models: {MergedModelIds}",
                    modelToKeep.Id, string.Join(", ", modelsToMerge.Select(m => m.Id)));
            }
            else
            {
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
