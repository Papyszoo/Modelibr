namespace Application.Categories;

/// <summary>
/// Shared DTO for all category types. All hierarchical categories
/// have the same summary shape: Id, Name, Description, ParentId, Path.
/// </summary>
public record CategorySummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? ParentId { get; init; }
    public string Path { get; init; } = string.Empty;
}
