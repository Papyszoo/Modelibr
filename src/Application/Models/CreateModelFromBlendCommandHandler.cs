using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Models;

internal class CreateModelFromBlendCommandHandler : ICommandHandler<CreateModelFromBlendCommand, CreateModelFromBlendResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _versionRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IDomainEventDispatcher _domainEventDispatcher;

    public CreateModelFromBlendCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository versionRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider,
        IDomainEventDispatcher domainEventDispatcher)
    {
        _modelRepository = modelRepository;
        _versionRepository = versionRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
        _domainEventDispatcher = domainEventDispatcher;
    }

    public async Task<Result<CreateModelFromBlendResponse>> Handle(
        CreateModelFromBlendCommand command,
        CancellationToken cancellationToken)
    {
        // Validate file type
        var fileTypeResult = FileType.ValidateForUpload(command.File.FileName);
        if (fileTypeResult.IsFailure)
            return Result.Failure<CreateModelFromBlendResponse>(fileTypeResult.Error);

        var fileType = fileTypeResult.Value;

        // Create or get existing file
        var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
            command.File, fileType, cancellationToken);
        if (fileResult.IsFailure)
            return Result.Failure<CreateModelFromBlendResponse>(fileResult.Error);

        var fileEntity = fileResult.Value;

        // Check for duplicate by hash
        var existingModel = await _modelRepository.GetByFileHashAsync(fileEntity.Sha256Hash, cancellationToken);
        if (existingModel != null)
        {
            return Result.Success(new CreateModelFromBlendResponse(existingModel.Id, true));
        }

        // Create model
        var modelName = command.ModelName;
        try
        {
            var model = Model.Create(modelName, _dateTimeProvider.UtcNow);
            var savedModel = await _modelRepository.AddAsync(model, cancellationToken);

            // Create version 1
            var version = savedModel.CreateVersion("Initial version", _dateTimeProvider.UtcNow);
            version.AddFile(fileEntity);
            await _versionRepository.AddAsync(version, cancellationToken);

            fileEntity.SetModelVersion(version.Id);
            await _modelRepository.UpdateAsync(savedModel, cancellationToken);

            // Always dispatch ModelUploadedEvent for .blend — asset-processor will convert
            savedModel.RaiseModelUploadedEvent(version.Id, fileEntity.Sha256Hash, true);

            if (savedModel.DomainEvents.Any())
            {
                await _domainEventDispatcher.PublishAsync(savedModel.DomainEvents, cancellationToken);
                savedModel.ClearDomainEvents();
            }

            return Result.Success(new CreateModelFromBlendResponse(savedModel.Id, false));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateModelFromBlendResponse>(
                new Error("ModelCreationFailed", ex.Message));
        }
    }
}

public record CreateModelFromBlendCommand(
    string ModelName,
    IFileUpload File) : ICommand<CreateModelFromBlendResponse>;

public record CreateModelFromBlendResponse(int ModelId, bool AlreadyExists);
