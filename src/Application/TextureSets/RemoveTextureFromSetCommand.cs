using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class RemoveTextureFromPackCommandHandler : ICommandHandler<RemoveTextureFromPackCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveTextureFromPackCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
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

            // Remove texture from the set
            textureSet.RemoveTexture(texture, _dateTimeProvider.UtcNow);

            // Update the texture set
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

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