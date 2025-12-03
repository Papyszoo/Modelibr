using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class AddSpriteToPackCommandHandler : ICommandHandler<AddSpriteToPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddSpriteToPackCommandHandler(
        IPackRepository packRepository,
        ISpriteRepository spriteRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _spriteRepository = spriteRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddSpriteToPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        var sprite = await _spriteRepository.GetByIdAsync(command.SpriteId, cancellationToken);
        if (sprite == null)
        {
            return Result.Failure(
                new Error("SpriteNotFound", $"Sprite with ID {command.SpriteId} was not found."));
        }

        pack.AddSprite(sprite, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        return Result.Success();
    }
}

public record AddSpriteToPackCommand(int PackId, int SpriteId) : ICommand;
