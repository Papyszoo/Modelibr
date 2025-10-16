using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

internal class AddTextureToPackCommandHandler : ICommandHandler<AddTextureToPackCommand, AddTextureToPackResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddTextureToPackCommandHandler(
        ITextureSetRepository textureSetRepository,
        IFileRepository fileRepository,
        IBatchUploadRepository batchUploadRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _fileRepository = fileRepository;
        _batchUploadRepository = batchUploadRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<AddTextureToPackResponse>> Handle(AddTextureToPackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the texture set
            var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<AddTextureToPackResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
            }

            // Get the file
            var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
            if (file == null)
            {
                return Result.Failure<AddTextureToPackResponse>(
                    new Error("FileNotFound", $"File with ID {command.FileId} was not found."));
            }

            // Validate texture type
            var textureTypeResult = command.TextureType.ValidateForStorage();
            if (!textureTypeResult.IsSuccess)
            {
                return Result.Failure<AddTextureToPackResponse>(textureTypeResult.Error);
            }

            // Create the texture using domain factory method
            var texture = Domain.Models.Texture.Create(file, command.TextureType, _dateTimeProvider.UtcNow);

            // Remove existing texture of the same type if it exists (for replacement)
            textureSet.RemoveTextureOfType(command.TextureType, _dateTimeProvider.UtcNow);

            // Add texture to the set (domain will enforce business rules)
            textureSet.AddTexture(texture, _dateTimeProvider.UtcNow);

            // Update the texture set
            var updatedTextureSet = await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            // Update batch upload record to associate with texture set
            var batchUpload = await _batchUploadRepository.GetByFileIdAsync(command.FileId, cancellationToken);
            if (batchUpload != null)
            {
                batchUpload.TextureSetId = command.TextureSetId;
                await _batchUploadRepository.UpdateAsync(batchUpload, cancellationToken);
            }

            return Result.Success(new AddTextureToPackResponse(texture.Id, texture.TextureType));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<AddTextureToPackResponse>(
                new Error("AddTextureToPackFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<AddTextureToPackResponse>(
                new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record AddTextureToPackCommand(int TextureSetId, int FileId, TextureType TextureType) : ICommand<AddTextureToPackResponse>;
public record AddTextureToPackResponse(int TextureId, TextureType TextureType);