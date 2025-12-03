using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Sprites;

internal class UpdateSpriteCommandHandler : ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse>
{
    private readonly ISpriteRepository _spriteRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateSpriteCommandHandler(
        ISpriteRepository spriteRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _spriteRepository = spriteRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateSpriteResponse>> Handle(UpdateSpriteCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var sprite = await _spriteRepository.GetByIdAsync(command.Id, cancellationToken);
            if (sprite == null)
            {
                return Result.Failure<UpdateSpriteResponse>(
                    new Error("SpriteNotFound", $"Sprite with ID {command.Id} not found."));
            }

            if (!string.IsNullOrWhiteSpace(command.Name) && command.Name != sprite.Name)
            {
                var existingSprite = await _spriteRepository.GetByNameAsync(command.Name, cancellationToken);
                if (existingSprite != null && existingSprite.Id != sprite.Id)
                {
                    return Result.Failure<UpdateSpriteResponse>(
                        new Error("SpriteAlreadyExists", $"A sprite with the name '{command.Name}' already exists."));
                }

                sprite.UpdateName(command.Name, _dateTimeProvider.UtcNow);
            }

            if (command.SpriteType.HasValue)
            {
                sprite.UpdateSpriteType(command.SpriteType.Value, _dateTimeProvider.UtcNow);
            }

            if (command.CategoryId != sprite.SpriteCategoryId)
            {
                sprite.UpdateCategory(command.CategoryId, _dateTimeProvider.UtcNow);
            }

            var savedSprite = await _spriteRepository.UpdateAsync(sprite, cancellationToken);

            return Result.Success(new UpdateSpriteResponse(savedSprite.Id, savedSprite.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateSpriteResponse>(
                new Error("SpriteUpdateFailed", ex.Message));
        }
    }
}

public record UpdateSpriteCommand(int Id, string? Name, Domain.ValueObjects.SpriteType? SpriteType, int? CategoryId) : ICommand<UpdateSpriteResponse>;
public record UpdateSpriteResponse(int Id, string Name);
