using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TexturePacks;

internal class AddTextureToPackCommandHandler : ICommandHandler<AddTextureToPackCommand, AddTextureToPackResponse>
{
    private readonly ITexturePackRepository _texturePackRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddTextureToPackCommandHandler(
        ITexturePackRepository texturePackRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _texturePackRepository = texturePackRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<AddTextureToPackResponse>> Handle(AddTextureToPackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the texture pack
            var texturePack = await _texturePackRepository.GetByIdAsync(command.TexturePackId, cancellationToken);
            if (texturePack == null)
            {
                return Result.Failure<AddTextureToPackResponse>(
                    new Error("TexturePackNotFound", $"Texture pack with ID {command.TexturePackId} was not found."));
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

            // Add texture to the pack (domain will enforce business rules)
            texturePack.AddTexture(texture, _dateTimeProvider.UtcNow);

            // Update the texture pack
            var updatedTexturePack = await _texturePackRepository.UpdateAsync(texturePack, cancellationToken);

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

public record AddTextureToPackCommand(int TexturePackId, int FileId, TextureType TextureType) : ICommand<AddTextureToPackResponse>;
public record AddTextureToPackResponse(int TextureId, TextureType TextureType);