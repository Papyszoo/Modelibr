using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

/// <summary>
/// Command to change the source channel of an existing texture in a texture set.
/// </summary>
public record UpdateTextureChannelCommand(
    int TextureSetId,
    int TextureId,
    TextureChannel SourceChannel) : ICommand<UpdateTextureChannelResponse>;

public record UpdateTextureChannelResponse(int TextureId, TextureType TextureType, TextureChannel SourceChannel);

public class UpdateTextureChannelCommandHandler : ICommandHandler<UpdateTextureChannelCommand, UpdateTextureChannelResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTextureChannelCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateTextureChannelResponse>> Handle(UpdateTextureChannelCommand command, CancellationToken cancellationToken)
    {
        // Get the texture set
        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure<UpdateTextureChannelResponse>(
                new Error("TextureSet.NotFound", $"Texture set with ID {command.TextureSetId} not found."));
        }

        // Find the texture in the set
        var texture = textureSet.Textures.FirstOrDefault(t => t.Id == command.TextureId);
        if (texture == null)
        {
            return Result.Failure<UpdateTextureChannelResponse>(
                new Error("Texture.NotFound", $"Texture with ID {command.TextureId} not found in the texture set."));
        }

        // Check if the source channel is the same (no-op)
        if (texture.SourceChannel == command.SourceChannel)
        {
            return Result.Success(new UpdateTextureChannelResponse(
                texture.Id, 
                texture.TextureType, 
                texture.SourceChannel));
        }

        try
        {
            // Update the source channel
            var now = _dateTimeProvider.UtcNow;
            texture.UpdateSourceChannel(command.SourceChannel, now);

            // Save changes
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success(new UpdateTextureChannelResponse(
                texture.Id, 
                texture.TextureType, 
                texture.SourceChannel));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateTextureChannelResponse>(
                new Error("Texture.InvalidChannel", ex.Message));
        }
    }
}
