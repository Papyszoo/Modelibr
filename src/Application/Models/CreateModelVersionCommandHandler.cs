using Application.Abstractions.Files;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Models;

internal class CreateModelVersionCommandHandler : ICommandHandler<CreateModelVersionCommand, CreateModelVersionResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _versionRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreateModelVersionCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository versionRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelRepository = modelRepository;
        _versionRepository = versionRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CreateModelVersionResponse>> Handle(
        CreateModelVersionCommand command,
        CancellationToken cancellationToken)
    {
        // Get the model with versions included
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure<CreateModelVersionResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Validate file type - allow both renderable models and project files like .blend
        var fileTypeResult = FileType.ValidateForUpload(command.File.FileName);
        if (fileTypeResult.IsFailure)
        {
            return Result.Failure<CreateModelVersionResponse>(fileTypeResult.Error);
        }

        var fileType = fileTypeResult.Value;

        // Create or get existing file
        var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
            command.File,
            fileType,
            cancellationToken);

        if (fileResult.IsFailure)
        {
            return Result.Failure<CreateModelVersionResponse>(fileResult.Error);
        }

        var fileEntity = fileResult.Value;

        // Check if this file (by hash) already exists for this model
        // This prevents creating orphan versions with no files when uploading duplicates
        var existingVersion = model.Versions.FirstOrDefault(v => 
            v.Files.Any(f => f.Sha256Hash == fileEntity.Sha256Hash));

        if (existingVersion != null)
        {
            return Result.Failure<CreateModelVersionResponse>(
                new Error("DuplicateFile", 
                    $"This file already exists in version {existingVersion.VersionNumber}. " +
                    "Upload a different file to create a new version."));
        }

        // Create new version
        // Query the max version number across ALL versions (including soft-deleted)
        // to avoid unique constraint violation on IX_ModelVersions_ModelId_VersionNumber
        var maxVersionNumber = await _versionRepository.GetLatestVersionNumberAsync(command.ModelId, cancellationToken);
        var nextVersionNumber = maxVersionNumber + 1;
        var version = model.CreateVersion(nextVersionNumber, command.Description, _dateTimeProvider.UtcNow);
        version.AddFile(fileEntity);

        // Save version. Commit immediately: savedVersion.Id is copied into raw
        // scalar FKs below (SetModelVersion, SetActiveVersion), carried in the
        // ModelUploadedEvent, and returned in the response - all need the real
        // database-assigned id, not EF's temporary key.
        var savedVersion = await _versionRepository.AddAsync(version, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Link file to version only if not already linked to another version
        // This prevents overwriting the ModelVersionId for deduplicated files
        if (fileEntity.ModelVersionId == null)
        {
            fileEntity.SetModelVersion(savedVersion.Id);
        }

        // Set this version as active if requested
        if (command.SetAsActive)
        {
            model.SetActiveVersion(savedVersion.Id, _dateTimeProvider.UtcNow);
        }

        // Raise domain event to trigger thumbnail generation for the new version.
        // Trigger for renderable files (direct thumbnail) and project files like .blend
        // (asset-processor converts .blend → .glb first, then generates thumbnail).
        // Must happen before the SaveChanges below (includes ActiveVersionChangedEvent
        // if SetAsActive was true) - the save pipeline dispatches whatever events are
        // on the aggregate at that point (see DomainEventsInterceptor); no manual
        // publish here.
        if (fileType.IsRenderable || fileType.Category == Domain.ValueObjects.FileTypeCategory.Project)
        {
            model.RaiseModelUploadedEvent(savedVersion.Id, fileEntity.Sha256Hash, true);
        }

        await _modelRepository.UpdateAsync(model, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new CreateModelVersionResponse(
            savedVersion.Id,
            savedVersion.VersionNumber,
            fileEntity.Id));
    }
}

public record CreateModelVersionCommand(
    int ModelId,
    IFileUpload File,
    string? Description = null,
    bool SetAsActive = true) : ICommand<CreateModelVersionResponse>;

public record CreateModelVersionResponse(
    int VersionId,
    int VersionNumber,
    int FileId);

