using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Files;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

internal class CreateTextureSetWithFileCommandHandler : ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateTextureSetWithFileCommandHandler(
        ITextureSetRepository textureSetRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateTextureSetWithFileResponse>> Handle(CreateTextureSetWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // 1. Validate and get file type for texture
            var fileTypeResult = FileType.ValidateForModelUpload(command.FileUpload.FileName);
            if (!fileTypeResult.IsSuccess)
            {
                return Result.Failure<CreateTextureSetWithFileResponse>(fileTypeResult.Error);
            }

            // 2. Upload the file (or get existing if duplicate)
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.FileUpload,
                fileTypeResult.Value,
                cancellationToken);

            if (!fileResult.IsSuccess)
            {
                return Result.Failure<CreateTextureSetWithFileResponse>(fileResult.Error);
            }

            var file = fileResult.Value;

            // 3. Create the texture set
            var textureSet = TextureSet.Create(command.Name, _dateTimeProvider.UtcNow);
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
    string? BatchId) : ICommand<CreateTextureSetWithFileResponse>;

public record CreateTextureSetWithFileResponse(
    int TextureSetId,
    string Name,
    int FileId,
    int TextureId,
    TextureType TextureType);
