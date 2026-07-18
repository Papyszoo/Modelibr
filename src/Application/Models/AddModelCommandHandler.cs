using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
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
        private readonly IModelVersionRepository _versionRepository;
        private readonly IFileCreationService _fileCreationService;
        private readonly IDateTimeProvider _dateTimeProvider;
        private readonly IBatchUploadRepository _batchUploadRepository;
        private readonly ISettingRepository _settingRepository;
        private readonly IUnitOfWork _unitOfWork;

        public AddModelCommandHandler(
            IModelRepository modelRepository,
            IModelVersionRepository versionRepository,
            IFileCreationService fileCreationService,
            IDateTimeProvider dateTimeProvider,
            IBatchUploadRepository batchUploadRepository,
            ISettingRepository settingRepository,
            IUnitOfWork unitOfWork)
        {
            _modelRepository = modelRepository;
            _versionRepository = versionRepository;
            _fileCreationService = fileCreationService;
            _dateTimeProvider = dateTimeProvider;
            _batchUploadRepository = batchUploadRepository;
            _settingRepository = settingRepository;
            _unitOfWork = unitOfWork;
        }

        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            // Validate file type for model upload using Value Object directly
            var fileTypeResult = FileType.ValidateForModelUpload(command.File.FileName);
            if (fileTypeResult.IsFailure)
            {
                return Result.Failure<AddModelCommandResponse>(fileTypeResult.Error);
            }

            // Create or get existing file
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.File, 
                fileTypeResult.Value, 
                cancellationToken);

            if (fileResult.IsFailure)
            {
                return Result.Failure<AddModelCommandResponse>(fileResult.Error);
            }

            var fileEntity = fileResult.Value;

            // Check if a model already exists with this file hash
            var existingModel = await _modelRepository.GetByFileHashAsync(fileEntity.Sha256Hash, cancellationToken);
            if (existingModel != null)
            {
            // Raise domain event for existing model upload — dispatched from the
                // save pipeline once this aggregate is persisted (see
                // DomainEventsInterceptor); no manual publish here.
                existingModel.RaiseModelUploadedEvent(existingModel.ActiveVersion!.Id, fileEntity.Sha256Hash, false, command.GenerateThumbnail);

                // Always track batch upload - generate batch ID if not provided
                var batchId = command.BatchId ?? Guid.NewGuid().ToString();
                var batchUpload = BatchUpload.Create(
                    batchId,
                    "model",
                    fileEntity.Id,
                    _dateTimeProvider.UtcNow,
                    modelId: existingModel.Id);
                
                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
                await _unitOfWork.SaveChangesAsync(cancellationToken);

                return Result.Success(new AddModelCommandResponse(existingModel.Id, true));
            }

            // Create new model
            var modelName = command.ModelName ?? 
                           Path.GetFileNameWithoutExtension(command.File.FileName);

            // Resolve name collision based on DuplicateNamePolicy setting
            var nameResult = await AssetNameService.ResolveNameAsync(
                modelName, "Model",
                _modelRepository.ExistsByNameAsync,
                _modelRepository.GetNamesByPrefixAsync,
                _settingRepository, cancellationToken);
            if (nameResult.IsFailure)
                return Result.Failure<AddModelCommandResponse>(nameResult.Error);

            modelName = nameResult.Value;

            try
            {
                var model = Model.Create(modelName, _dateTimeProvider.UtcNow);

                // Save the model first — it must be committed BEFORE CreateVersion runs:
                // the first version sets Model.ActiveVersion, and if model and version
                // are both still Added in one save, EF hits the circular
                // Model.ActiveVersionId <-> ModelVersion.ModelId FK dependency and throws.
                var savedModel = await _modelRepository.AddAsync(model, cancellationToken);
                await _unitOfWork.SaveChangesAsync(cancellationToken);

                // Create version 1 automatically for new models
                var version1 = savedModel.CreateVersion("Initial version", _dateTimeProvider.UtcNow);
                version1.AddFile(fileEntity);
                await _versionRepository.AddAsync(version1, cancellationToken);

                // Commit again so version1 gets its real database-assigned id —
                // SetModelVersion below copies it into a raw scalar FK (see the
                // backend-patterns skill's temporary-key trap).
                await _unitOfWork.SaveChangesAsync(cancellationToken);

                // Link file to version
                fileEntity.SetModelVersion(version1.Id);
                await _modelRepository.UpdateAsync(savedModel, cancellationToken);
                
                // Raise domain event for new model upload after both model and file are
                // persisted — dispatched from the save pipeline (see DomainEventsInterceptor);
                // no manual publish here.
                savedModel.RaiseModelUploadedEvent(version1.Id, fileEntity.Sha256Hash, true, command.GenerateThumbnail);

                // Always track batch upload - generate batch ID if not provided
                var batchId = command.BatchId ?? Guid.NewGuid().ToString();
                var batchUpload = BatchUpload.Create(
                    batchId,
                    "model",
                    fileEntity.Id,
                    _dateTimeProvider.UtcNow,
                    modelId: savedModel.Id);
                
                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
                await _unitOfWork.SaveChangesAsync(cancellationToken);

                return Result.Success(new AddModelCommandResponse(savedModel.Id, false));
            }
            catch (ArgumentException ex)
            {
                return Result.Failure<AddModelCommandResponse>(new Error("ModelCreationFailed", ex.Message));
            }
        }
    }

    public record AddModelCommand(IFileUpload File, string? ModelName = null, string? BatchId = null, bool GenerateThumbnail = true) : ICommand<AddModelCommandResponse>;
    public record AddModelCommandResponse(int Id, bool AlreadyExists = false);
}
