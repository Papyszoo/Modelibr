using Application.Abstractions.Files;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Models;

internal class AddFileToVersionCommandHandler : ICommandHandler<AddFileToVersionCommand, AddFileToVersionResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _versionRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IBlendFileGenerationQueue _blendFileGenerationQueue;
    private readonly IUnitOfWork _unitOfWork;

    public AddFileToVersionCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository versionRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider,
        IBlendFileGenerationQueue blendFileGenerationQueue,
        IUnitOfWork unitOfWork)
    {
        _modelRepository = modelRepository;
        _versionRepository = versionRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
        _blendFileGenerationQueue = blendFileGenerationQueue;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<AddFileToVersionResponse>> Handle(
        AddFileToVersionCommand command,
        CancellationToken cancellationToken)
    {
        // Get the model with versions included
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure<AddFileToVersionResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Get the specific version
        var version = await _versionRepository.GetByIdAsync(command.VersionId, cancellationToken);
        if (version == null)
        {
            return Result.Failure<AddFileToVersionResponse>(
                new Error("VersionNotFound", $"Version with ID {command.VersionId} was not found."));
        }

        // Validate that the version belongs to this model
        if (version.ModelId != command.ModelId)
        {
            return Result.Failure<AddFileToVersionResponse>(
                new Error("VersionMismatch", $"Version {command.VersionId} does not belong to model {command.ModelId}."));
        }

        // Validate file type - allow both renderable models and project files like .blend
        var fileTypeResult = FileType.ValidateForUpload(command.File.FileName);
        if (fileTypeResult.IsFailure)
        {
            return Result.Failure<AddFileToVersionResponse>(fileTypeResult.Error);
        }

        var fileType = fileTypeResult.Value;

        // Create or get existing file
        var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
            command.File,
            fileType,
            cancellationToken);

        if (fileResult.IsFailure)
        {
            return Result.Failure<AddFileToVersionResponse>(fileResult.Error);
        }

        var fileEntity = fileResult.Value;

        // Add file to version
        version.AddFile(fileEntity);
        fileEntity.SetModelVersion(version.Id);

        // Update
        await _versionRepository.UpdateAsync(version, cancellationToken);
        await _modelRepository.UpdateAsync(model, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // This is the asset-processor worker's landing point for the .glb it extracts
        // from a Blender-saved version (the version is created with only a .blend —
        // see WebDavMiddleware's Safe-Save MOVE handling — and has no renderable file
        // until this call attaches one). Schedule background .blend regeneration now so
        // generated-{name}.blend reappears in WebDAV listings without waiting for a
        // client GET to trigger generation synchronously.
        if (fileType.IsRenderable)
        {
            _blendFileGenerationQueue.Enqueue(command.ModelId, version.Id);
        }

        return Result.Success(new AddFileToVersionResponse(
            version.Id,
            version.VersionNumber,
            fileEntity.Id));
    }
}

public record AddFileToVersionCommand(
    int ModelId,
    int VersionId,
    IFileUpload File) : ICommand<AddFileToVersionResponse>;

public record AddFileToVersionResponse(
    int VersionId,
    int VersionNumber,
    int FileId);
