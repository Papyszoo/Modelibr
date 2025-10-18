using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Models
{
    internal class AddModelCommandHandler : ICommandHandler<AddModelCommand, AddModelCommandResponse>
    {
        private readonly IModelRepository _modelRepository;
        private readonly IFileCreationService _fileCreationService;
        private readonly IDateTimeProvider _dateTimeProvider;
        private readonly IDomainEventDispatcher _domainEventDispatcher;
        private readonly IBatchUploadRepository _batchUploadRepository;
        private readonly IModelMetadataExtractionService _metadataExtractionService;

        public AddModelCommandHandler(
            IModelRepository modelRepository, 
            IFileCreationService fileCreationService,
            IDateTimeProvider dateTimeProvider,
            IDomainEventDispatcher domainEventDispatcher,
            IBatchUploadRepository batchUploadRepository,
            IModelMetadataExtractionService metadataExtractionService)
        {
            _modelRepository = modelRepository;
            _fileCreationService = fileCreationService;
            _dateTimeProvider = dateTimeProvider;
            _domainEventDispatcher = domainEventDispatcher;
            _batchUploadRepository = batchUploadRepository;
            _metadataExtractionService = metadataExtractionService;
        }

        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            // Validate file type for model upload using Value Object directly
            var fileTypeResult = FileType.ValidateForModelUpload(command.File.FileName);
            if (!fileTypeResult.IsSuccess)
            {
                return Result.Failure<AddModelCommandResponse>(fileTypeResult.Error);
            }

            // Create or get existing file
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.File, 
                fileTypeResult.Value, 
                cancellationToken);

            if (!fileResult.IsSuccess)
            {
                return Result.Failure<AddModelCommandResponse>(fileResult.Error);
            }

            var fileEntity = fileResult.Value;

            // Extract model metadata (vertices and faces count)
            var metadata = await _metadataExtractionService.ExtractMetadataAsync(
                fileEntity.FilePath, 
                cancellationToken);

            // Determine model name from command or file name
            var modelName = command.ModelName ?? 
                           Path.GetFileNameWithoutExtension(command.File.FileName);

            // Check for duplicate model by name and vertices count
            var existingModelByMetadata = await _modelRepository.GetByNameAndVerticesAsync(
                modelName, 
                metadata?.Vertices, 
                cancellationToken);

            if (existingModelByMetadata != null)
            {
                // Check if the file with this hash already exists on this model
                if (!existingModelByMetadata.HasFile(fileEntity.Sha256Hash))
                {
                    // Same model (name + vertices), but different file format - add file to existing model
                    await _modelRepository.AddFileAsync(existingModelByMetadata.Id, fileEntity, cancellationToken);
                }

                // Raise domain event for existing model upload
                existingModelByMetadata.RaiseModelUploadedEvent(fileEntity.Sha256Hash, false);
                
                // Publish domain events
                await _domainEventDispatcher.PublishAsync(existingModelByMetadata.DomainEvents, cancellationToken);
                existingModelByMetadata.ClearDomainEvents();
                
                // Always track batch upload - generate batch ID if not provided
                var batchId = command.BatchId ?? Guid.NewGuid().ToString();
                var batchUpload = BatchUpload.Create(
                    batchId,
                    "model",
                    fileEntity.Id,
                    _dateTimeProvider.UtcNow,
                    modelId: existingModelByMetadata.Id);
                
                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
                
                return Result.Success(new AddModelCommandResponse(existingModelByMetadata.Id, true));
            }

            // Create new model
            try
            {
                var model = Model.Create(modelName, _dateTimeProvider.UtcNow);
                
                // Set geometry metadata if available
                if (metadata != null)
                {
                    model.SetGeometryMetadata(metadata.Vertices, metadata.Faces, _dateTimeProvider.UtcNow);
                }
                
                // Save the model first to get an ID
                var savedModel = await _modelRepository.AddAsync(model, cancellationToken);
                
                // Now add the file to the model (this properly persists the file entity to the database)
                await _modelRepository.AddFileAsync(savedModel.Id, fileEntity, cancellationToken);
                
                // Raise domain event for new model upload after both model and file are persisted
                savedModel.RaiseModelUploadedEvent(fileEntity.Sha256Hash, true);
                
                // Publish domain events
                await _domainEventDispatcher.PublishAsync(savedModel.DomainEvents, cancellationToken);
                savedModel.ClearDomainEvents();
                
                // Always track batch upload - generate batch ID if not provided
                var batchId = command.BatchId ?? Guid.NewGuid().ToString();
                var batchUpload = BatchUpload.Create(
                    batchId,
                    "model",
                    fileEntity.Id,
                    _dateTimeProvider.UtcNow,
                    modelId: savedModel.Id);
                
                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
                
                return Result.Success(new AddModelCommandResponse(savedModel.Id, false));
            }
            catch (ArgumentException ex)
            {
                return Result.Failure<AddModelCommandResponse>(new Error("ModelCreationFailed", ex.Message));
            }
        }
    }

    public record AddModelCommand(IFileUpload File, string? ModelName = null, string? BatchId = null) : ICommand<AddModelCommandResponse>;
    public record AddModelCommandResponse(int Id, bool AlreadyExists = false);
}
