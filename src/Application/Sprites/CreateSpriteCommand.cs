using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Sprites;

internal class CreateSpriteCommandHandler : ICommandHandler<CreateSpriteCommand, CreateSpriteResponse>
{
    private readonly ISpriteRepository _spriteRepository;
    private readonly ISpriteCategoryRepository _spriteCategoryRepository;
    private readonly IFileRepository _fileRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSpriteCommandHandler(
        ISpriteRepository spriteRepository,
        ISpriteCategoryRepository spriteCategoryRepository,
        IFileRepository fileRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _spriteRepository = spriteRepository;
        _spriteCategoryRepository = spriteCategoryRepository;
        _fileRepository = fileRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CreateSpriteResponse>> Handle(CreateSpriteCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Resolve name collision based on DuplicateNamePolicy setting (same as the
            // upload path): Allow keeps the name, Reject fails, AutoRename suffixes.
            var nameResult = await AssetNameService.ResolveNameAsync(
                command.Name, "Sprite",
                _spriteRepository.ExistsByNameAsync,
                _spriteRepository.GetNamesByPrefixAsync,
                _settingRepository, cancellationToken);
            if (nameResult.IsFailure)
            {
                return Result.Failure<CreateSpriteResponse>(
                    new Error("SpriteAlreadyExists", $"A sprite with the name '{command.Name}' already exists."));
            }

            var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
            if (file == null)
            {
                return Result.Failure<CreateSpriteResponse>(
                    new Error("FileNotFound", $"File with ID {command.FileId} not found."));
            }

            if (command.CategoryId.HasValue)
            {
                var category = await _spriteCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                if (category == null)
                {
                    return Result.Failure<CreateSpriteResponse>(
                        new Error("CategoryNotFound", $"Sprite category with ID {command.CategoryId.Value} was not found."));
                }
            }

            var sprite = Sprite.Create(
                nameResult.Value,
                file,
                command.SpriteType,
                _dateTimeProvider.UtcNow,
                command.CategoryId);

            var savedSprite = await _spriteRepository.AddAsync(sprite, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return Result.Success(new CreateSpriteResponse(savedSprite.Id, savedSprite.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateSpriteResponse>(
                new Error("SpriteCreationFailed", ex.Message));
        }
    }
}

public record CreateSpriteCommand(string Name, int FileId, SpriteType SpriteType, int? CategoryId = null) : ICommand<CreateSpriteResponse>;
public record CreateSpriteResponse(int Id, string Name);
