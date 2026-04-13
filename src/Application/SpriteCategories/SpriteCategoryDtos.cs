using Application.Categories;
using Domain.Models;

namespace Application.SpriteCategories;

public record SpriteCategorySummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? ParentId { get; init; }
    public string Path { get; init; } = string.Empty;
}

internal static class SpriteCategoryMappings
{
    internal static SpriteCategorySummaryDto ToSummaryDto(SpriteCategory category, IReadOnlyList<SpriteCategory> categories)
        => new()
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = HierarchicalCategoryHelpers.BuildPath(category, categories, c => c.Id, c => c.ParentId, c => c.Name)
        };
}
