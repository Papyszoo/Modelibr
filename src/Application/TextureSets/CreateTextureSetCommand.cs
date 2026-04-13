using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

internal class CreateTextureSetCommandHandler : ICommandHandler<CreateTextureSetCommand, CreateTextureSetResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ITextureSetCategoryRepository _textureSetCategoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        ITextureSetCategoryRepository textureSetCategoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _textureSetCategoryRepository = textureSetCategoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateTextureSetResponse>> Handle(CreateTextureSetCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Check if a texture set with the same name already exists
            var existingTextureSet = await _textureSetRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingTextureSet != null)
            {
                return Result.Failure<CreateTextureSetResponse>(
                    new Error("TextureSetAlreadyExists", $"A texture set with the name '{command.Name}' already exists."));
            }

            if (command.CategoryId.HasValue)
            {
                var category = await _textureSetCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                if (category == null)
                {
                    return Result.Failure<CreateTextureSetResponse>(
                        new Error("CategoryNotFound", $"Texture set category with ID {command.CategoryId.Value} was not found."));
                }
            }

            // Create new texture set using domain factory method
            var textureSet = TextureSet.Create(command.Name, _dateTimeProvider.UtcNow, command.Kind);
            textureSet.AssignCategory(command.CategoryId, _dateTimeProvider.UtcNow);

            var savedTextureSet = await _textureSetRepository.AddAsync(textureSet, cancellationToken);

            return Result.Success(new CreateTextureSetResponse(savedTextureSet.Id, savedTextureSet.Name, savedTextureSet.Kind, savedTextureSet.TextureSetCategoryId));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateTextureSetResponse>(
                new Error("TextureSetCreationFailed", ex.Message));
        }
    }
}

public record CreateTextureSetCommand(string Name, TextureSetKind Kind = TextureSetKind.ModelSpecific, int? CategoryId = null) : ICommand<CreateTextureSetResponse>;
public record CreateTextureSetResponse(int Id, string Name, TextureSetKind Kind, int? CategoryId);
