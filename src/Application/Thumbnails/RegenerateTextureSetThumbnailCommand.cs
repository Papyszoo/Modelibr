using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.Thumbnails;

internal class RegenerateTextureSetThumbnailCommandHandler : ICommandHandler<RegenerateTextureSetThumbnailCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IThumbnailQueue _thumbnailQueue;

    public RegenerateTextureSetThumbnailCommandHandler(
        ITextureSetRepository textureSetRepository,
        IThumbnailQueue thumbnailQueue)
    {
        _textureSetRepository = textureSetRepository;
        _thumbnailQueue = thumbnailQueue;
    }

    public async Task<Result> Handle(RegenerateTextureSetThumbnailCommand command, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure(
                new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
        }

        await _thumbnailQueue.EnqueueTextureSetThumbnailAsync(command.TextureSetId, cancellationToken: cancellationToken);

        return Result.Success();
    }
}

public record RegenerateTextureSetThumbnailCommand(int TextureSetId) : ICommand;
