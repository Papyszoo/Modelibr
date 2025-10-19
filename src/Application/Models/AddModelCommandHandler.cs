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

        public AddModelCommandHandler(
            IModelRepository modelRepository, 
            IFileCreationService fileCreationService,
            IDateTimeProvider dateTimeProvider,
            IDomainEventDispatcher domainEventDispatcher,
            IBatchUploadRepository batchUploadRepository)
        {
            _modelRepository = modelRepository;
            _fileCreationService = fileCreationService;
            _dateTimeProvider = dateTimeProvider;
            _domainEventDispatcher = domainEventDispatcher;
            _batchUploadRepository = batchUploadRepository;
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

            // Determine model name from command or file name
            var modelName = command.ModelName ?? 
                           Path.GetFileNameWithoutExtension(command.File.FileName);

            // Check for existing model by file hash
            var existingModelByHash = await _modelRepository.GetByFileHashAsync(
                fileEntity.Sha256Hash, 
                cancellationToken);

            if (existingModelByHash != null)
            {
                // File already exists - return existing model
                // No need to add the file again
                
                // Raise domain event for existing model upload
                existingModelByHash.RaiseModelUploadedEvent(fileEntity.Sha256Hash, false);
                
                // Publish domain events
                await _domainEventDispatcher.PublishAsync(existingModelByHash.DomainEvents, cancellationToken);
                existingModelByHash.ClearDomainEvents();
                
                // Always track batch upload - generate batch ID if not provided
                var batchId = command.BatchId ?? Guid.NewGuid().ToString();
                var batchUpload = BatchUpload.Create(
                    batchId,
                    "model",
                    fileEntity.Id,
                    _dateTimeProvider.UtcNow,
                    modelId: existingModelByHash.Id);
                
                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
                
                return Result.Success(new AddModelCommandResponse(existingModelByHash.Id, true));
            }

            // Create new model
            try
            {
                var model = Model.Create(modelName, _dateTimeProvider.UtcNow);
                
                // Note: Geometry metadata (vertices, faces) will be populated by the worker service
                // after it loads the model for thumbnail generation
                
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
