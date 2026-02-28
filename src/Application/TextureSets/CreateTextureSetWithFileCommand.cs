using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Files;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.TextureSets;

internal class CreateTextureSetWithFileCommandHandler : ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<CreateTextureSetWithFileCommandHandler> _logger;

    public CreateTextureSetWithFileCommandHandler(
        ITextureSetRepository textureSetRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider,
        IThumbnailQueue thumbnailQueue,
        ILogger<CreateTextureSetWithFileCommandHandler> logger)
    {
        _textureSetRepository = textureSetRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailQueue = thumbnailQueue;
        _logger = logger;
    }

    public async Task<Result<CreateTextureSetWithFileResponse>> Handle(CreateTextureSetWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // 1. Validate and get file type for texture
            var fileTypeResult = FileType.ValidateForUpload(command.FileUpload.FileName);
            if (fileTypeResult.IsFailure)
            {
                return Result.Failure<CreateTextureSetWithFileResponse>(fileTypeResult.Error);
            }

            // 2. Upload the file (or get existing if duplicate)
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.FileUpload,
                fileTypeResult.Value,
                cancellationToken);

            if (fileResult.IsFailure)
            {
                return Result.Failure<CreateTextureSetWithFileResponse>(fileResult.Error);
            }

            var file = fileResult.Value;

            // 3. Create the texture set
            var textureSet = TextureSet.Create(command.Name, _dateTimeProvider.UtcNow, command.Kind);
            var createdTextureSet = await _textureSetRepository.AddAsync(textureSet, cancellationToken);

            // 4. Create and add texture to the set
            var texture = Texture.Create(file, command.TextureType, _dateTimeProvider.UtcNow);
            createdTextureSet.AddTexture(texture, _dateTimeProvider.UtcNow);

            // Update the texture set with the texture
            var updatedTextureSet = await _textureSetRepository.UpdateAsync(createdTextureSet, cancellationToken);

            // 5. Track batch upload if batchId provided
            if (!string.IsNullOrWhiteSpace(command.BatchId))
            {
                var batchUpload = BatchUpload.Create(
                    command.BatchId,
                    "texture",
                    file.Id,
                    _dateTimeProvider.UtcNow,
                    packId: null,
                    modelId: null,
                    textureSetId: updatedTextureSet.Id);

                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
            }

            // 6. Auto-enqueue thumbnail generation for Universal texture sets
            if (updatedTextureSet.Kind == TextureSetKind.Universal)
            {
                try
                {
                    await _thumbnailQueue.EnqueueTextureSetThumbnailAsync(updatedTextureSet.Id, cancellationToken: cancellationToken);
                    _logger.LogInformation("Auto-enqueued thumbnail job for Universal texture set {TextureSetId}", updatedTextureSet.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to auto-enqueue thumbnail job for texture set {TextureSetId}, can be regenerated manually", updatedTextureSet.Id);
                }
            }

            return Result.Success(new CreateTextureSetWithFileResponse(
                updatedTextureSet.Id,
                updatedTextureSet.Name,
                file.Id,
                texture.Id,
                texture.TextureType));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateTextureSetWithFileResponse>(
                new Error("CreateTextureSetWithFileFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<CreateTextureSetWithFileResponse>(
                new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record CreateTextureSetWithFileCommand(
    IFileUpload FileUpload,
    string Name,
    TextureType TextureType,
    string? BatchId,
    TextureSetKind Kind = TextureSetKind.ModelSpecific) : ICommand<CreateTextureSetWithFileResponse>;

public record CreateTextureSetWithFileResponse(
    int TextureSetId,
    string Name,
    int FileId,
    int TextureId,
    TextureType TextureType);
