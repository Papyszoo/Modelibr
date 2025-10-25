using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class RemoveTextureFromPackCommandHandler : ICommandHandler<RemoveTextureFromPackCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IFileRecyclingService _fileRecyclingService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveTextureFromPackCommandHandler(
        ITextureSetRepository textureSetRepository,
        IFileRepository fileRepository,
        IFileRecyclingService fileRecyclingService,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _fileRepository = fileRepository;
        _fileRecyclingService = fileRecyclingService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveTextureFromPackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the texture set
            var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
            }

            // Find the texture to remove
            var texture = textureSet.Textures.FirstOrDefault(t => t.Id == command.TextureId);
            if (texture == null)
            {
                return Result.Failure(
                    new Error("TextureNotFound", $"Texture with ID {command.TextureId} was not found in the texture set."));
            }

            // Get the file associated with the texture and recycle it
            var file = await _fileRepository.GetByIdAsync(texture.FileId, cancellationToken);
            if (file != null)
            {
                await _fileRecyclingService.RecycleFileAsync(
                    file,
                    $"Texture removed from texture set '{textureSet.Name}' (ID: {textureSet.Id})",
                    cancellationToken);
            }

            // Remove texture from the set
            textureSet.RemoveTexture(texture, _dateTimeProvider.UtcNow);

            // Update the texture set
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("RemoveTextureFromPackFailed", ex.Message));
        }
    }
}

public record RemoveTextureFromPackCommand(int TextureSetId, int TextureId) : ICommand;