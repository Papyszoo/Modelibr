using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Categories;

/// <summary>
/// Shared logic for hierarchical category Create/Update/Delete operations.
/// Concrete category command handlers delegate to these methods, eliminating
/// duplicated validation and persistence logic across category types.
/// </summary>
internal static class CategoryCommandHandlers
{
    internal static async Task<Result<CategorySummaryDto>> CreateAsync<TCategory>(
        IHierarchicalCategoryRepository<TCategory> repository,
        string name,
        string? description,
        int? parentId,
        string categoryTypeName,
        Func<string, string?, int?, DateTime, TCategory> factory,
        DateTime now,
        CancellationToken cancellationToken)
        where TCategory : class, IHierarchicalCategory<TCategory>
    {
        var existing = await repository.GetByNameAsync(name.Trim(), parentId, cancellationToken);
        if (existing != null)
        {
            return Result.Failure<CategorySummaryDto>(
                new Error("CategoryAlreadyExists", $"A {categoryTypeName} named '{name}' already exists in this branch."));
        }

        try
        {
            var category = factory(name, description, parentId, now);
            await repository.AddAsync(category, cancellationToken);

            var path = category.Name;
            if (parentId.HasValue)
            {
                var allCategories = await repository.GetAllAsync(cancellationToken);
                path = HierarchicalCategoryHelpers.BuildPath(
                    category, allCategories, c => c.Id, c => c.ParentId, c => c.Name);
            }

            return Result.Success(new CategorySummaryDto
            {
                Id = category.Id,
                Name = category.Name,
                Description = category.Description,
                ParentId = category.ParentId,
                Path = path
            });
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CategorySummaryDto>(
                new Error("CategoryCreationFailed", ex.Message));
        }
    }

    internal static async Task<Result> UpdateAsync<TCategory>(
        IHierarchicalCategoryRepository<TCategory> repository,
        int id,
        string name,
        string? description,
        int? parentId,
        string categoryTypeName,
        DateTime now,
        CancellationToken cancellationToken)
        where TCategory : class, IHierarchicalCategory<TCategory>
    {
        var category = await repository.GetByIdAsync(id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"{categoryTypeName} with ID {id} was not found."));
        }

        if (parentId.HasValue)
        {
            if (parentId.Value == id)
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be its own parent."));

            var allCategories = await repository.GetAllAsync(cancellationToken);
            if (HierarchicalCategoryHelpers.IsDescendant(id, parentId.Value, allCategories, c => c.Id, c => c.ParentId))
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be moved under one of its descendants."));
        }

        var existing = await repository.GetByNameAsync(name.Trim(), parentId, cancellationToken);
        if (existing != null && existing.Id != id)
        {
            return Result.Failure(
                new Error("CategoryAlreadyExists", $"A {categoryTypeName} named '{name}' already exists in this branch."));
        }

        try
        {
            category.Update(name, description, now);
            category.MoveTo(parentId, now);
            await repository.UpdateAsync(category, cancellationToken);
            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(new Error("CategoryUpdateFailed", ex.Message));
        }
    }

    internal static async Task<Result> DeleteAsync<TCategory>(
        IHierarchicalCategoryRepository<TCategory> repository,
        int id,
        string categoryTypeName,
        CancellationToken cancellationToken)
        where TCategory : class, IHierarchicalCategory<TCategory>
    {
        var category = await repository.GetByIdAsync(id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"{categoryTypeName} with ID {id} was not found."));
        }

        if (category.Children.Any())
        {
            return Result.Failure(
                new Error("CategoryHasChildren", "Delete or move child categories before removing this category."));
        }

        await repository.DeleteAsync(category, cancellationToken);
        return Result.Success();
    }
}
