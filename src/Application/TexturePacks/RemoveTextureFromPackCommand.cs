using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TexturePacks;

internal class RemoveTextureFromPackCommandHandler : ICommandHandler<RemoveTextureFromPackCommand>
{
    private readonly ITexturePackRepository _texturePackRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveTextureFromPackCommandHandler(
        ITexturePackRepository texturePackRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _texturePackRepository = texturePackRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveTextureFromPackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the texture pack
            var texturePack = await _texturePackRepository.GetByIdAsync(command.TexturePackId, cancellationToken);
            if (texturePack == null)
            {
                return Result.Failure(
                    new Error("TexturePackNotFound", $"Texture pack with ID {command.TexturePackId} was not found."));
            }

            // Find the texture to remove
            var texture = texturePack.Textures.FirstOrDefault(t => t.Id == command.TextureId);
            if (texture == null)
            {
                return Result.Failure(
                    new Error("TextureNotFound", $"Texture with ID {command.TextureId} was not found in the texture pack."));
            }

            // Remove texture from the pack
            texturePack.RemoveTexture(texture, _dateTimeProvider.UtcNow);

            // Update the texture pack
            await _texturePackRepository.UpdateAsync(texturePack, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("RemoveTextureFromPackFailed", ex.Message));
        }
    }
}

public record RemoveTextureFromPackCommand(int TexturePackId, int TextureId) : ICommand;