using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TexturePacks;

internal class UpdateTexturePackCommandHandler : ICommandHandler<UpdateTexturePackCommand, UpdateTexturePackResponse>
{
    private readonly ITexturePackRepository _texturePackRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTexturePackCommandHandler(
        ITexturePackRepository texturePackRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _texturePackRepository = texturePackRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateTexturePackResponse>> Handle(UpdateTexturePackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var texturePack = await _texturePackRepository.GetByIdAsync(command.Id, cancellationToken);
            if (texturePack == null)
            {
                return Result.Failure<UpdateTexturePackResponse>(
                    new Error("TexturePackNotFound", $"Texture pack with ID {command.Id} was not found."));
            }

            // Check if another texture pack with the same name already exists (excluding current one)
            var existingTexturePack = await _texturePackRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingTexturePack != null && existingTexturePack.Id != command.Id)
            {
                return Result.Failure<UpdateTexturePackResponse>(
                    new Error("TexturePackNameAlreadyExists", $"A texture pack with the name '{command.Name}' already exists."));
            }

            // Update the texture pack name
            texturePack.UpdateName(command.Name, _dateTimeProvider.UtcNow);

            var updatedTexturePack = await _texturePackRepository.UpdateAsync(texturePack, cancellationToken);

            return Result.Success(new UpdateTexturePackResponse(updatedTexturePack.Id, updatedTexturePack.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateTexturePackResponse>(
                new Error("TexturePackUpdateFailed", ex.Message));
        }
    }
}

public record UpdateTexturePackCommand(int Id, string Name) : ICommand<UpdateTexturePackResponse>;
public record UpdateTexturePackResponse(int Id, string Name);