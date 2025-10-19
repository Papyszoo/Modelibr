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

            // Find existing model with same name and vertices count
            var duplicateModel = await _modelRepository.GetByNameAndVerticesAsync(
                domainEvent.ModelName,
                domainEvent.Vertices.Value,
                cancellationToken);

            // If we found a duplicate and it's not the same model
            if (duplicateModel != null && duplicateModel.Id != domainEvent.ModelId)
            {
                _logger.LogInformation(
                    "Found duplicate model {DuplicateModelId} for model {ModelId} with name '{ModelName}' and {Vertices} vertices. Merging files...",
                    duplicateModel.Id, domainEvent.ModelId, domainEvent.ModelName, domainEvent.Vertices);

                // Get the current model to access its files
                var currentModel = await _modelRepository.GetByIdAsync(domainEvent.ModelId, cancellationToken);
                
                if (currentModel == null)
                {
                    _logger.LogWarning("Model {ModelId} not found during deduplication", domainEvent.ModelId);
                    return Result.Failure(new Error("ModelNotFound", $"Model {domainEvent.ModelId} not found"));
                }

                // Determine which model to keep (prefer the one created first - lower ID)
                var modelToKeep = duplicateModel.Id < currentModel.Id ? duplicateModel : currentModel;
                var modelToMerge = duplicateModel.Id < currentModel.Id ? currentModel : duplicateModel;

                _logger.LogInformation(
                    "Keeping model {KeepModelId} and merging files from model {MergeModelId}",
                    modelToKeep.Id, modelToMerge.Id);

                // Move all files from modelToMerge to modelToKeep
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

                // Note: We cannot delete the merged model here as we don't have a delete method
                // The model will remain but with no files. This could be cleaned up separately
                // or the repository could be extended with a delete method.
                
                _logger.LogInformation(
                    "Successfully merged files from model {MergeModelId} into model {KeepModelId}. Model {MergeModelId} now has no files.",
                    modelToMerge.Id, modelToKeep.Id, modelToMerge.Id);
            }
            else
            {
                _logger.LogInformation(
                    "No duplicate model found for model {ModelId} with name '{ModelName}' and {Vertices} vertices",
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
