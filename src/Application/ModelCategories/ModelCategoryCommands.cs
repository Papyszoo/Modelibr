using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.ModelCategories;

internal sealed class CreateModelCategoryCommandHandler : ICommandHandler<CreateModelCategoryCommand, ModelCategorySummaryDto>
{
    private readonly IModelCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateModelCategoryCommandHandler(IModelCategoryRepository categoryRepository, IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<ModelCategorySummaryDto>> Handle(CreateModelCategoryCommand command, CancellationToken cancellationToken)
    {
        var existing = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existing != null)
        {
            return Result.Failure<ModelCategorySummaryDto>(new Error("CategoryAlreadyExists", $"A model category named '{command.Name}' already exists in this branch."));
        }

        var category = ModelCategory.Create(command.Name, command.Description, command.ParentId, _dateTimeProvider.UtcNow);
        await _categoryRepository.AddAsync(category, cancellationToken);

        return Result.Success(new ModelCategorySummaryDto
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = category.Name
        });
    }
}

internal sealed class UpdateModelCategoryCommandHandler : ICommandHandler<UpdateModelCategoryCommand>
{
    private readonly IModelCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateModelCategoryCommandHandler(IModelCategoryRepository categoryRepository, IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdateModelCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(new Error("CategoryNotFound", $"Model category with ID {command.Id} was not found."));
        }

        if (command.ParentId.HasValue)
        {
            if (command.ParentId.Value == command.Id)
            {
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be its own parent."));
            }

            var allCategories = await _categoryRepository.GetAllAsync(cancellationToken);
            if (IsDescendant(command.Id, command.ParentId.Value, allCategories))
            {
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be moved under one of its descendants."));
            }
        }

        var existing = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existing != null && existing.Id != command.Id)
        {
            return Result.Failure(new Error("CategoryAlreadyExists", $"A model category named '{command.Name}' already exists in this branch."));
        }

        category.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);
        category.MoveTo(command.ParentId, _dateTimeProvider.UtcNow);
        await _categoryRepository.UpdateAsync(category, cancellationToken);
        return Result.Success();
    }

    private static bool IsDescendant(int categoryId, int proposedParentId, IReadOnlyList<ModelCategory> categories)
    {
        var current = categories.FirstOrDefault(c => c.Id == proposedParentId);
        while (current != null)
        {
            if (current.ParentId == categoryId)
            {
                return true;
            }

            current = current.ParentId.HasValue
                ? categories.FirstOrDefault(c => c.Id == current.ParentId.Value)
                : null;
        }

        return false;
    }
}

internal sealed class DeleteModelCategoryCommandHandler : ICommandHandler<DeleteModelCategoryCommand>
{
    private readonly IModelCategoryRepository _categoryRepository;

    public DeleteModelCategoryCommandHandler(IModelCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result> Handle(DeleteModelCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(new Error("CategoryNotFound", $"Model category with ID {command.Id} was not found."));
        }

        if (category.Children.Any())
        {
            return Result.Failure(new Error("CategoryHasChildren", "Delete or move child categories before removing this category."));
        }

        await _categoryRepository.DeleteAsync(category, cancellationToken);
        return Result.Success();
    }
}

public record CreateModelCategoryCommand(string Name, string? Description, int? ParentId) : ICommand<ModelCategorySummaryDto>;
public record UpdateModelCategoryCommand(int Id, string Name, string? Description, int? ParentId) : ICommand;
public record DeleteModelCategoryCommand(int Id) : ICommand;