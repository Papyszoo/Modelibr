using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

/// <summary>
/// Command to change the texture type of an existing texture in a texture set.
/// </summary>
public record ChangeTextureTypeCommand(
    int TextureSetId,
    int TextureId,
    TextureType NewTextureType) : ICommand;

public class ChangeTextureTypeCommandHandler : ICommandHandler<ChangeTextureTypeCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public ChangeTextureTypeCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(ChangeTextureTypeCommand request, CancellationToken cancellationToken)
    {
        // Get the texture set
        var textureSet = await _textureSetRepository.GetByIdAsync(request.TextureSetId, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure(
                new Error("TextureSet.NotFound", $"Texture set with ID {request.TextureSetId} not found."));
        }

        // Find the texture in the set
        var texture = textureSet.Textures.FirstOrDefault(t => t.Id == request.TextureId);
        if (texture == null)
        {
            return Result.Failure(
                new Error("Texture.NotFound", $"Texture with ID {request.TextureId} not found in the texture set."));
        }

        // Check if the texture type is the same (no-op)
        if (texture.TextureType == request.NewTextureType)
        {
            return Result.Success();
        }

        // Check if the target type already exists in the set
        if (textureSet.HasTextureOfType(request.NewTextureType))
        {
            return Result.Failure(
                new Error("TextureType.AlreadyExists", 
                    $"A texture of type '{request.NewTextureType.GetDescription()}' already exists in this set."));
        }

        // Update the texture type
        var now = _dateTimeProvider.UtcNow;
        texture.UpdateTextureType(request.NewTextureType, now);

        // Save changes
        await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

        return Result.Success();
    }
}
