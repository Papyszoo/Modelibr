using Application.Categories;
using Domain.Models;

namespace Application.EnvironmentMapCategories;

public record EnvironmentMapCategorySummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? ParentId { get; init; }
    public string Path { get; init; } = string.Empty;
}

internal static class EnvironmentMapCategoryMappings
{
    internal static EnvironmentMapCategorySummaryDto ToSummaryDto(EnvironmentMapCategory category, IReadOnlyList<EnvironmentMapCategory> categories)
        => new()
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = HierarchicalCategoryHelpers.BuildPath(category, categories, c => c.Id, c => c.ParentId, c => c.Name)
        };

    internal static string? BuildPath(EnvironmentMapCategory? category)
    {
        if (category == null)
            return null;

        var segments = new Stack<string>();
        var current = category;
        while (current != null)
        {
            segments.Push(current.Name);
            current = current.Parent;
        }

        return string.Join(" / ", segments);
    }
}
