using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Sprites;

internal class UpdateSpriteCommandHandler : ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse>
{
    private readonly ISpriteRepository _spriteRepository;
    private readonly ISpriteCategoryRepository _spriteCategoryRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSpriteCommandHandler(
        ISpriteRepository spriteRepository,
        ISpriteCategoryRepository spriteCategoryRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _spriteRepository = spriteRepository;
        _spriteCategoryRepository = spriteCategoryRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
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
                // Renames follow the same DuplicateNamePolicy as creation: Allow keeps the
                // name as-is, Reject fails, AutoRename appends a numeric suffix. The
                // existence check excludes this sprite itself so it can keep or re-case
                // its own name without tripping the Reject policy.
                var nameResult = await AssetNameService.ResolveNameAsync(
                    command.Name, "Sprite",
                    async (name, ct) =>
                    {
                        var other = await _spriteRepository.GetByNameAsync(name, ct);
                        return other != null && other.Id != sprite.Id;
                    },
                    _spriteRepository.GetNamesByPrefixAsync,
                    _settingRepository, cancellationToken);
                if (nameResult.IsFailure)
                {
                    return Result.Failure<UpdateSpriteResponse>(
                        new Error("SpriteAlreadyExists", $"A sprite with the name '{command.Name}' already exists."));
                }

                sprite.UpdateName(nameResult.Value, _dateTimeProvider.UtcNow);
            }

            if (command.SpriteType.HasValue)
            {
                sprite.UpdateSpriteType(command.SpriteType.Value, _dateTimeProvider.UtcNow);
            }

            if (command.CategoryId != sprite.SpriteCategoryId)
            {
                if (command.CategoryId.HasValue)
                {
                    var category = await _spriteCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                    if (category == null)
                    {
                        return Result.Failure<UpdateSpriteResponse>(
                            new Error("CategoryNotFound", $"Sprite category with ID {command.CategoryId.Value} was not found."));
                    }
                }

                sprite.UpdateCategory(command.CategoryId, _dateTimeProvider.UtcNow);
            }

            var savedSprite = await _spriteRepository.UpdateAsync(sprite, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

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
