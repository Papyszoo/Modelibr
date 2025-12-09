using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Files;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Sprites;

internal class CreateSpriteWithFileCommandHandler : ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>
{
    private readonly ISpriteRepository _spriteRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateSpriteWithFileCommandHandler(
        ISpriteRepository spriteRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider)
    {
        _spriteRepository = spriteRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateSpriteWithFileResponse>> Handle(CreateSpriteWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // 1. Validate and get file type for sprite
            var fileTypeResult = FileType.ValidateForSpriteUpload(command.FileUpload.FileName);
            if (!fileTypeResult.IsSuccess)
            {
                return Result.Failure<CreateSpriteWithFileResponse>(fileTypeResult.Error);
            }

            // 2. Upload the file (or get existing if duplicate)
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.FileUpload,
                fileTypeResult.Value,
                cancellationToken);

            if (!fileResult.IsSuccess)
            {
                return Result.Failure<CreateSpriteWithFileResponse>(fileResult.Error);
            }

            var file = fileResult.Value;

            // 3. Check if a sprite already exists with this file hash
            var existingSprite = await _spriteRepository.GetByFileHashAsync(file.Sha256Hash, cancellationToken);
            if (existingSprite != null)
            {
                // Track batch upload if batchId provided
                if (!string.IsNullOrWhiteSpace(command.BatchId))
                {
                    var batchUpload = BatchUpload.Create(
                        command.BatchId,
                        "sprite",
                        file.Id,
                        _dateTimeProvider.UtcNow,
                        packId: command.PackId,
                        projectId: command.ProjectId,
                        modelId: null,
                        textureSetId: null,
                        spriteId: existingSprite.Id);

                    await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
                }

                return Result.Success(new CreateSpriteWithFileResponse(
                    existingSprite.Id,
                    existingSprite.Name,
                    file.Id,
                    existingSprite.SpriteType,
                    file.SizeBytes));
            }

            // 4. Create new sprite
            var sprite = Sprite.Create(
                command.Name,
                file,
                command.SpriteType,
                _dateTimeProvider.UtcNow,
                command.CategoryId);

            var createdSprite = await _spriteRepository.AddAsync(sprite, cancellationToken);

            // 5. Track batch upload if batchId provided
            if (!string.IsNullOrWhiteSpace(command.BatchId))
            {
                var batchUpload = BatchUpload.Create(
                    command.BatchId,
                    "sprite",
                    file.Id,
                    _dateTimeProvider.UtcNow,
                    packId: command.PackId,
                    projectId: command.ProjectId,
                    modelId: null,
                    textureSetId: null,
                    spriteId: createdSprite.Id);

                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
            }

            return Result.Success(new CreateSpriteWithFileResponse(
                createdSprite.Id,
                createdSprite.Name,
                file.Id,
                createdSprite.SpriteType,
                file.SizeBytes));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateSpriteWithFileResponse>(
                new Error("CreateSpriteWithFileFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<CreateSpriteWithFileResponse>(
                new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record CreateSpriteWithFileCommand(
    IFileUpload FileUpload,
    string Name,
    SpriteType SpriteType,
    int? CategoryId,
    string? BatchId,
    int? PackId,
    int? ProjectId) : ICommand<CreateSpriteWithFileResponse>;

public record CreateSpriteWithFileResponse(
    int SpriteId,
    string Name,
    int FileId,
    SpriteType SpriteType,
    long FileSizeBytes);
