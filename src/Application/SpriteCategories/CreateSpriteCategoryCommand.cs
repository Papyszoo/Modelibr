using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.SpriteCategories;

internal class CreateSpriteCategoryCommandHandler : ICommandHandler<CreateSpriteCategoryCommand, CreateSpriteCategoryResponse>
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

    public async Task<Result<CreateSpriteCategoryResponse>> Handle(CreateSpriteCategoryCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var existingCategory = await _categoryRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingCategory != null)
            {
                return Result.Failure<CreateSpriteCategoryResponse>(
                    new Error("CategoryAlreadyExists", $"A sprite category with the name '{command.Name}' already exists."));
            }

            var category = SpriteCategory.Create(command.Name, command.Description, _dateTimeProvider.UtcNow);

            var savedCategory = await _categoryRepository.AddAsync(category, cancellationToken);

            return Result.Success(new CreateSpriteCategoryResponse(savedCategory.Id, savedCategory.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateSpriteCategoryResponse>(
                new Error("CategoryCreationFailed", ex.Message));
        }
    }
}

public record CreateSpriteCategoryCommand(string Name, string? Description = null) : ICommand<CreateSpriteCategoryResponse>;
public record CreateSpriteCategoryResponse(int Id, string Name);
