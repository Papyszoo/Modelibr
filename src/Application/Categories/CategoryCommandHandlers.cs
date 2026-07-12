using Application.Abstractions;
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
        IUnitOfWork unitOfWork,
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
            // Commit immediately: category.Id is database-assigned and is needed
            // below for the response DTO.
            await unitOfWork.SaveChangesAsync(cancellationToken);

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
        IUnitOfWork unitOfWork,
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
            await unitOfWork.SaveChangesAsync(cancellationToken);
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
        IUnitOfWork unitOfWork,
        CancellationToken cancellationToken)
        where TCategory : class, IHierarchicalCategory<TCategory>
    {
        var category = await repository.GetByIdAsync(id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"{categoryTypeName} with ID {id} was not found."));
        }

        // Deleting a category removes its whole branch. Descendants are
        // deleted children-first to satisfy the Restrict FK on ParentId;
        // assets assigned anywhere in the branch become uncategorized via
        // the SetNull FK on the asset -> category relationship. All deletes
        // land in one commit below, so a failure partway through (e.g. an
        // unexpected FK violation) leaves the whole branch untouched instead
        // of a partially-deleted tree.
        var allCategories = await repository.GetAllAsync(cancellationToken);
        foreach (var descendantId in CollectDescendantIdsChildrenFirst(allCategories, id))
        {
            // Re-fetch per id so each delete works on the context's tracked
            // instance (GetAllAsync snapshots are untracked duplicates).
            var descendant = await repository.GetByIdAsync(descendantId, cancellationToken);
            if (descendant != null)
            {
                await repository.DeleteAsync(descendant, cancellationToken);
            }
        }

        await repository.DeleteAsync(category, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    /// <summary>
    /// Ids of every descendant of <paramref name="rootId"/> (excluding the
    /// root itself), ordered so children always precede their parent.
    /// </summary>
    private static List<int> CollectDescendantIdsChildrenFirst<TCategory>(
        IReadOnlyList<TCategory> categories,
        int rootId)
        where TCategory : class, IHierarchicalCategory<TCategory>
    {
        var byParent = categories
            .Where(c => c.ParentId.HasValue)
            .ToLookup(c => c.ParentId!.Value, c => c.Id);

        var ordered = new List<int>();

        void Visit(int categoryId)
        {
            foreach (var childId in byParent[categoryId])
            {
                Visit(childId);
                ordered.Add(childId);
            }
        }

        Visit(rootId);
        return ordered;
    }
}
