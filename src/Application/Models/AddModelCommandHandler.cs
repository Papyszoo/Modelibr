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

        public AddModelCommandHandler(
            IModelRepository modelRepository, 
            IFileCreationService fileCreationService,
            IDateTimeProvider dateTimeProvider,
            IDomainEventDispatcher domainEventDispatcher)
        {
            _modelRepository = modelRepository;
            _fileCreationService = fileCreationService;
            _dateTimeProvider = dateTimeProvider;
            _domainEventDispatcher = domainEventDispatcher;
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

            // Check if a model already exists with this file hash
            var existingModel = await _modelRepository.GetByFileHashAsync(fileEntity.Sha256Hash, cancellationToken);
            if (existingModel != null)
            {
                // Raise domain event for existing model upload
                existingModel.RaiseModelUploadedEvent(fileEntity.Sha256Hash, false);
                
                // Publish domain events
                await _domainEventDispatcher.PublishAsync(existingModel.DomainEvents, cancellationToken);
                existingModel.ClearDomainEvents();
                
                return Result.Success(new AddModelCommandResponse(existingModel.Id, true));
            }

            // Create new model
            var modelName = command.ModelName ?? 
                           Path.GetFileNameWithoutExtension(command.File.FileName);

            try
            {
                var model = Model.Create(modelName, _dateTimeProvider.UtcNow);
                model.AddFile(fileEntity, _dateTimeProvider.UtcNow);

                var savedModel = await _modelRepository.AddAsync(model, cancellationToken);
                
                // Raise domain event for new model upload
                savedModel.RaiseModelUploadedEvent(fileEntity.Sha256Hash, true);
                
                // Publish domain events
                await _domainEventDispatcher.PublishAsync(savedModel.DomainEvents, cancellationToken);
                savedModel.ClearDomainEvents();
                
                return Result.Success(new AddModelCommandResponse(savedModel.Id, false));
            }
            catch (ArgumentException ex)
            {
                return Result.Failure<AddModelCommandResponse>(new Error("ModelCreationFailed", ex.Message));
            }
        }
    }

    public record AddModelCommand(IFileUpload File, string? ModelName = null) : ICommand<AddModelCommandResponse>;
    public record AddModelCommandResponse(int Id, bool AlreadyExists = false);
}
