using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Sprites;

internal class SoftDeleteSpriteCommandHandler : ICommandHandler<SoftDeleteSpriteCommand>
{
    private readonly ISpriteRepository _spriteRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SoftDeleteSpriteCommandHandler(
        ISpriteRepository spriteRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _spriteRepository = spriteRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SoftDeleteSpriteCommand command, CancellationToken cancellationToken)
    {
        var sprite = await _spriteRepository.GetByIdAsync(command.Id, cancellationToken);
        if (sprite == null)
        {
            return Result.Failure(
                new Error("SpriteNotFound", $"Sprite with ID {command.Id} not found."));
        }

        if (sprite.IsDeleted)
        {
            return Result.Failure(
                new Error("SpriteAlreadyDeleted", $"Sprite with ID {command.Id} is already deleted."));
        }

        sprite.SoftDelete(_dateTimeProvider.UtcNow);
        await _spriteRepository.UpdateAsync(sprite, cancellationToken);

        return Result.Success();
    }
}

public record SoftDeleteSpriteCommand(int Id) : ICommand;
