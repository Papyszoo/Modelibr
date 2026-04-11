using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMapCategories;

internal sealed class CreateEnvironmentMapCategoryCommandHandler : ICommandHandler<CreateEnvironmentMapCategoryCommand, EnvironmentMapCategorySummaryDto>
{
    private readonly IEnvironmentMapCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateEnvironmentMapCategoryCommandHandler(IEnvironmentMapCategoryRepository categoryRepository, IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<EnvironmentMapCategorySummaryDto>> Handle(CreateEnvironmentMapCategoryCommand command, CancellationToken cancellationToken)
    {
        var existing = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existing != null)
        {
            return Result.Failure<EnvironmentMapCategorySummaryDto>(
                new Error("CategoryAlreadyExists", $"An environment map category named '{command.Name}' already exists in this branch."));
        }

        var category = EnvironmentMapCategory.Create(command.Name, command.Description, command.ParentId, _dateTimeProvider.UtcNow);
        await _categoryRepository.AddAsync(category, cancellationToken);

        return Result.Success(new EnvironmentMapCategorySummaryDto
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = category.Name
        });
    }
}

internal sealed class UpdateEnvironmentMapCategoryCommandHandler : ICommandHandler<UpdateEnvironmentMapCategoryCommand>
{
    private readonly IEnvironmentMapCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateEnvironmentMapCategoryCommandHandler(IEnvironmentMapCategoryRepository categoryRepository, IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdateEnvironmentMapCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
            return Result.Failure(new Error("CategoryNotFound", $"Environment map category with ID {command.Id} was not found."));

        if (command.ParentId.HasValue)
        {
            if (command.ParentId.Value == command.Id)
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be its own parent."));

            var allCategories = await _categoryRepository.GetAllAsync(cancellationToken);
            if (HierarchicalCategoryHelpers.IsDescendant(command.Id, command.ParentId.Value, allCategories, c => c.Id, c => c.ParentId))
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be moved under one of its descendants."));
        }

        var existing = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existing != null && existing.Id != command.Id)
        {
            return Result.Failure(
                new Error("CategoryAlreadyExists", $"An environment map category named '{command.Name}' already exists in this branch."));
        }

        category.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);
        category.MoveTo(command.ParentId, _dateTimeProvider.UtcNow);
        await _categoryRepository.UpdateAsync(category, cancellationToken);
        return Result.Success();
    }
}

internal sealed class DeleteEnvironmentMapCategoryCommandHandler : ICommandHandler<DeleteEnvironmentMapCategoryCommand>
{
    private readonly IEnvironmentMapCategoryRepository _categoryRepository;

    public DeleteEnvironmentMapCategoryCommandHandler(IEnvironmentMapCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result> Handle(DeleteEnvironmentMapCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
            return Result.Failure(new Error("CategoryNotFound", $"Environment map category with ID {command.Id} was not found."));

        if (category.Children.Any())
            return Result.Failure(new Error("CategoryHasChildren", "Delete or move child categories before removing this category."));

        await _categoryRepository.DeleteAsync(category, cancellationToken);
        return Result.Success();
    }
}

public record CreateEnvironmentMapCategoryCommand(string Name, string? Description, int? ParentId) : ICommand<EnvironmentMapCategorySummaryDto>;
public record UpdateEnvironmentMapCategoryCommand(int Id, string Name, string? Description, int? ParentId) : ICommand;
public record DeleteEnvironmentMapCategoryCommand(int Id) : ICommand;
