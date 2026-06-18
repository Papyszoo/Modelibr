using Application.Categories;
using Domain.Models;

namespace Application.ScriptCategories;

public record ScriptCategorySummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? ParentId { get; init; }
    public string Path { get; init; } = string.Empty;
}

internal static class ScriptCategoryMappings
{
    internal static ScriptCategorySummaryDto ToSummaryDto(ScriptCategory category, IReadOnlyList<ScriptCategory> categories)
        => new()
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = HierarchicalCategoryHelpers.BuildPath(category, categories, c => c.Id, c => c.ParentId, c => c.Name)
        };
}
