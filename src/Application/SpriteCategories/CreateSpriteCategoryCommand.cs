using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.SpriteCategories;

internal class CreateSpriteCategoryCommandHandler : ICommandHandler<CreateSpriteCategoryCommand, SpriteCategorySummaryDto>
{
    private readonly ISpriteCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateSpriteCategoryCommandHandler(
        ISpriteCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<SpriteCategorySummaryDto>> Handle(CreateSpriteCategoryCommand command, CancellationToken cancellationToken)
    {
        var existingCategory = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existingCategory != null)
        {
            return Result.Failure<SpriteCategorySummaryDto>(
                new Error("CategoryAlreadyExists", $"A sprite category named '{command.Name}' already exists in this branch."));
        }

        try
        {
            var category = SpriteCategory.Create(command.Name, command.Description, command.ParentId, _dateTimeProvider.UtcNow);
            await _categoryRepository.AddAsync(category, cancellationToken);

            return Result.Success(new SpriteCategorySummaryDto
            {
                Id = category.Id,
                Name = category.Name,
                Description = category.Description,
                ParentId = category.ParentId,
                Path = category.Name
            });
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<SpriteCategorySummaryDto>(new Error("CategoryCreationFailed", ex.Message));
        }
    }
}

public record CreateSpriteCategoryCommand(string Name, string? Description = null, int? ParentId = null) : ICommand<SpriteCategorySummaryDto>;
