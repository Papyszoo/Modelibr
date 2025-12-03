using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Sprites;

internal class CreateSpriteCommandHandler : ICommandHandler<CreateSpriteCommand, CreateSpriteResponse>
{
    private readonly ISpriteRepository _spriteRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateSpriteCommandHandler(
        ISpriteRepository spriteRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _spriteRepository = spriteRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateSpriteResponse>> Handle(CreateSpriteCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var existingSprite = await _spriteRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingSprite != null)
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

            var sprite = Sprite.Create(
                command.Name,
                file,
                command.SpriteType,
                _dateTimeProvider.UtcNow,
                command.CategoryId);

            var savedSprite = await _spriteRepository.AddAsync(sprite, cancellationToken);

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
