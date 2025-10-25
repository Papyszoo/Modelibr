using Application.Abstractions.Files;
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

    public CreateModelVersionCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository versionRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _versionRepository = versionRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
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

        // Check if this is the first version - if so, create version 1 with existing files
        if (model.Versions.Count == 0 && model.Files.Any())
        {
            // Create version 1 with existing model files
            var version1 = model.CreateVersion("Initial version (existing model)", _dateTimeProvider.UtcNow);
            
            // Add all existing model files to version 1
            foreach (var existingFile in model.Files)
            {
                version1.AddFile(existingFile);
                existingFile.SetModelVersion(version1.Id);
            }
            
            // Save version 1
            await _versionRepository.AddAsync(version1, cancellationToken);
            await _modelRepository.UpdateAsync(model, cancellationToken);
        }

        // Validate file type - allow both renderable models and project files like .blend
        var fileTypeResult = FileType.ValidateForUpload(command.File.FileName);
        if (!fileTypeResult.IsSuccess)
        {
            return Result.Failure<CreateModelVersionResponse>(fileTypeResult.Error);
        }

        var fileType = fileTypeResult.Value;

        // Create or get existing file
        var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
            command.File,
            fileType,
            cancellationToken);

        if (!fileResult.IsSuccess)
        {
            return Result.Failure<CreateModelVersionResponse>(fileResult.Error);
        }

        var fileEntity = fileResult.Value;

        // Create new version (this will be version 2 or higher now)
        var version = model.CreateVersion(command.Description, _dateTimeProvider.UtcNow);
        version.AddFile(fileEntity);

        // Save version
        var savedVersion = await _versionRepository.AddAsync(version, cancellationToken);

        // Link file to version
        fileEntity.SetModelVersion(savedVersion.Id);
        await _modelRepository.UpdateAsync(model, cancellationToken);

        return Result.Success(new CreateModelVersionResponse(
            savedVersion.Id,
            savedVersion.VersionNumber,
            fileEntity.Id));
    }
}

public record CreateModelVersionCommand(
    int ModelId,
    IFileUpload File,
    string? Description = null) : ICommand<CreateModelVersionResponse>;

public record CreateModelVersionResponse(
    int VersionId,
    int VersionNumber,
    int FileId);
