using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class RemoveTextureSetFromPackCommandHandler : ICommandHandler<RemoveTextureSetFromPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveTextureSetFromPackCommandHandler(
        IPackRepository packRepository,
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveTextureSetFromPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure(
                new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
        }

        pack.RemoveTextureSet(textureSet, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        return Result.Success();
    }
}

public record RemoveTextureSetFromPackCommand(int PackId, int TextureSetId) : ICommand;
