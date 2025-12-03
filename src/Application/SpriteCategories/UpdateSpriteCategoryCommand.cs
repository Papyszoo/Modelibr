using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.SpriteCategories;

internal class UpdateSpriteCategoryCommandHandler : ICommandHandler<UpdateSpriteCategoryCommand, UpdateSpriteCategoryResponse>
{
    private readonly ISpriteCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateSpriteCategoryCommandHandler(
        ISpriteCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateSpriteCategoryResponse>> Handle(UpdateSpriteCategoryCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
            if (category == null)
            {
                return Result.Failure<UpdateSpriteCategoryResponse>(
                    new Error("CategoryNotFound", $"Sprite category with ID {command.Id} not found."));
            }

            if (command.Name != category.Name)
            {
                var existingCategory = await _categoryRepository.GetByNameAsync(command.Name, cancellationToken);
                if (existingCategory != null && existingCategory.Id != category.Id)
                {
                    return Result.Failure<UpdateSpriteCategoryResponse>(
                        new Error("CategoryAlreadyExists", $"A sprite category with the name '{command.Name}' already exists."));
                }
            }

            category.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);

            var savedCategory = await _categoryRepository.UpdateAsync(category, cancellationToken);

            return Result.Success(new UpdateSpriteCategoryResponse(savedCategory.Id, savedCategory.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateSpriteCategoryResponse>(
                new Error("CategoryUpdateFailed", ex.Message));
        }
    }
}

public record UpdateSpriteCategoryCommand(int Id, string Name, string? Description = null) : ICommand<UpdateSpriteCategoryResponse>;
public record UpdateSpriteCategoryResponse(int Id, string Name);
