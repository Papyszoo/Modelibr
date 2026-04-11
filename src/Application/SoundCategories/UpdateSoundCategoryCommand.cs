using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Services;
using SharedKernel;

namespace Application.SoundCategories;

internal class UpdateSoundCategoryCommandHandler : ICommandHandler<UpdateSoundCategoryCommand>
{
    private readonly ISoundCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateSoundCategoryCommandHandler(
        ISoundCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdateSoundCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"Sound category with ID {command.Id} was not found."));
        }

        if (command.ParentId.HasValue)
        {
            if (command.ParentId.Value == command.Id)
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be its own parent."));

            var allCategories = await _categoryRepository.GetAllAsync(cancellationToken);
            if (HierarchicalCategoryHelpers.IsDescendant(command.Id, command.ParentId.Value, allCategories, c => c.Id, c => c.ParentId))
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be moved under one of its descendants."));
        }

        var existingCategory = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existingCategory != null && existingCategory.Id != command.Id)
        {
            return Result.Failure(
                new Error("CategoryAlreadyExists", $"A sound category named '{command.Name}' already exists in this branch."));
        }

        try
        {
            category.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);
            category.MoveTo(command.ParentId, _dateTimeProvider.UtcNow);
            await _categoryRepository.UpdateAsync(category, cancellationToken);
            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(new Error("CategoryUpdateFailed", ex.Message));
        }
    }
}

public record UpdateSoundCategoryCommand(int Id, string Name, string? Description = null, int? ParentId = null) : ICommand;
