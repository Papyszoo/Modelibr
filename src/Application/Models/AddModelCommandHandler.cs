using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
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
        private readonly ICommandHandler<ApplyImportAutomationCommand, ImportAutomationResponse> _importAutomation;
        private readonly ILogger<AddModelCommandHandler> _logger;
        private readonly IUnitOfWork _unitOfWork;

        public AddModelCommandHandler(
            IModelRepository modelRepository,
            IModelVersionRepository versionRepository,
            IFileCreationService fileCreationService,
            IDateTimeProvider dateTimeProvider,
            IBatchUploadRepository batchUploadRepository,
            ISettingRepository settingRepository,
            ICommandHandler<ApplyImportAutomationCommand, ImportAutomationResponse> importAutomation,
            ILogger<AddModelCommandHandler> logger,
            IUnitOfWork unitOfWork)
        {
            _modelRepository = modelRepository;
            _versionRepository = versionRepository;
            _fileCreationService = fileCreationService;
            _dateTimeProvider = dateTimeProvider;
            _batchUploadRepository = batchUploadRepository;
            _settingRepository = settingRepository;
            _importAutomation = importAutomation;
            _logger = logger;
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

            // Check if a model already exists with this file hash.
            //
            // The primary file's hash is the whole identity ONLY for a self-contained
            // model. A loose .gltf is identity-incomplete: two different assets can share
            // byte-identical JSON while referencing different .bin buffers, and merging
            // them silently keeps one asset's geometry and discards the other's. The
            // multi-file import path therefore re-runs this command with
            // SkipDeduplication once it has resolved the auxiliaries and found the
            // referenced resources differ.
            var existingModel = command.SkipDeduplication
                ? null
                : await _modelRepository.GetByFileHashAsync(fileEntity.Sha256Hash, cancellationToken);
            if (existingModel != null)
            {
            // Raise domain event for existing model upload - dispatched from the
                // save pipeline once this aggregate is persisted (see
                // DomainEventsInterceptor); no manual publish here.
                if (!command.DeferProcessing)
                {
                    existingModel.RaiseModelUploadedEvent(existingModel.ActiveVersion!.Id, fileEntity.Sha256Hash, false, command.GenerateThumbnail);
                }

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

                return Result.Success(new AddModelCommandResponse(
                    existingModel.Id, true, fileEntity.Sha256Hash, existingModel.ActiveVersion!.Id));
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

                // Save the model first - it must be committed BEFORE CreateVersion runs:
                // the first version sets Model.ActiveVersion, and if model and version
                // are both still Added in one save, EF hits the circular
                // Model.ActiveVersionId <-> ModelVersion.ModelId FK dependency and throws.
                var savedModel = await _modelRepository.AddAsync(model, cancellationToken);
                await _unitOfWork.SaveChangesAsync(cancellationToken);

                // Create version 1 automatically for new models
                var version1 = savedModel.CreateVersion("Initial version", _dateTimeProvider.UtcNow);
                version1.AddFile(fileEntity);
                await _versionRepository.AddAsync(version1, cancellationToken);

                // Commit again so version1 gets its real database-assigned id -
                // SetModelVersion below copies it into a raw scalar FK (see the
                // backend-patterns skill's temporary-key trap).
                await _unitOfWork.SaveChangesAsync(cancellationToken);

                // Link file to version
                fileEntity.SetModelVersion(version1.Id);
                await _modelRepository.UpdateAsync(savedModel, cancellationToken);
                
                // Raise domain event for new model upload after both model and file are
                // persisted - dispatched from the save pipeline (see DomainEventsInterceptor);
                // no manual publish here.
                if (!command.DeferProcessing)
                {
                    savedModel.RaiseModelUploadedEvent(version1.Id, fileEntity.Sha256Hash, true, command.GenerateThumbnail);
                }

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

                // Classify what just landed, from the file name plus whatever the importing
                // route knew about where it came from. New models only: a re-import that
                // resolved to an existing asset returned above, and re-deciding an asset a
                // person has since curated is exactly what this must not do.
                //
                // After the commit above on purpose - the automation reads the model back
                // and needs its real id and its (empty) tag set to be durable first.
                if (command.AutoAssignMetadata)
                {
                    // Never fatal. The model is already committed and is perfectly usable
                    // uncategorised; turning a guess that could not be made into a failed
                    // import would be the worst possible trade.
                    try
                    {
                        await _importAutomation.Handle(
                            new ApplyImportAutomationCommand(
                                savedModel.Id, command.SourceFolder, command.SiblingFileNames),
                            cancellationToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        _logger.LogError(ex,
                            "Import automation failed for model {ModelId}; it was imported without a suggested category or tags.",
                            savedModel.Id);
                    }
                }

                return Result.Success(new AddModelCommandResponse(
                    savedModel.Id, false, fileEntity.Sha256Hash, version1.Id));
            }
            catch (ArgumentException ex)
            {
                return Result.Failure<AddModelCommandResponse>(new Error("ModelCreationFailed", ex.Message));
            }
        }
    }

    /// <param name="GenerateThumbnail">
    /// Whether the upload event should ask the worker for a thumbnail. Store imports set
    /// this false when the manifest already ships a rendered thumbnail for the item.
    /// </param>
    /// <param name="SkipDeduplication">
    /// Forces a distinct model even when the primary file's hash already exists. Set only
    /// by callers that own a broader identity than the primary file - today the multi-file
    /// glTF import, whose referenced .bin/textures are part of what the asset IS.
    /// </param>
    /// <param name="SourceFolder">
    /// The directory the primary file came out of, as the importing route saw it: an
    /// absolute server path for a path import, the archive-relative directory for a zip.
    /// Null for a plain HTTP upload, which carries a filename and nothing else. Recorded as
    /// provenance and read as a weak taxonomy signal - see <see cref="Search.ImportFolderSignal"/>.
    /// </param>
    /// <param name="SiblingFileNames">
    /// The names of the other importable files in that same folder. The naming convention a
    /// folder follows is what classifies the assets whose own name does not - <c>SM_Veh_Wheel_03</c>
    /// is a vehicle part only because everything beside it is <c>SM_Veh_*</c>.
    /// </param>
    /// <param name="AutoAssignMetadata">
    /// Whether to let the import classify itself. False for callers that arrive with real
    /// metadata of their own - a store import carries the manifest's category and tags, and
    /// guessing over them would be strictly worse.
    /// </param>
    public record AddModelCommand(
        IFileUpload File,
        string? ModelName = null,
        string? BatchId = null,
        bool GenerateThumbnail = true,
        bool SkipDeduplication = false,
        string? SourceFolder = null,
        IReadOnlyList<string>? SiblingFileNames = null,
        bool AutoAssignMetadata = true,
        bool DeferProcessing = false) : ICommand<AddModelCommandResponse>;

    /// <param name="FileSha256">
    /// The stored primary's hash. Returned so a caller that deferred processing can raise
    /// <c>ModelUploadedEvent</c> itself without re-hashing the upload.
    /// </param>
    public record AddModelCommandResponse(
        int Id, bool AlreadyExists = false, string FileSha256 = "", int ModelVersionId = 0);
}
