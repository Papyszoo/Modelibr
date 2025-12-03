using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Sprites;

internal class DeleteSpriteCommandHandler : ICommandHandler<DeleteSpriteCommand>
{
    private readonly ISpriteRepository _spriteRepository;

    public DeleteSpriteCommandHandler(ISpriteRepository spriteRepository)
    {
        _spriteRepository = spriteRepository;
    }

    public async Task<Result> Handle(DeleteSpriteCommand command, CancellationToken cancellationToken)
    {
        var sprite = await _spriteRepository.GetByIdAsync(command.Id, cancellationToken);
        if (sprite == null)
        {
            return Result.Failure(
                new Error("SpriteNotFound", $"Sprite with ID {command.Id} not found."));
        }

        await _spriteRepository.DeleteAsync(command.Id, cancellationToken);

        return Result.Success();
    }
}

public record DeleteSpriteCommand(int Id) : ICommand;
