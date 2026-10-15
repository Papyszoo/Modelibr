namespace Domain.Models;

/// <summary>A character form, optionally associated with a project level.</summary>
public class CharacterVariant
{
    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int ProjectCharacterId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public int? ProjectLevelId { get; private set; }
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public ProjectCharacter ProjectCharacter { get; private set; } = null!;
    public ProjectLevel? ProjectLevel { get; private set; }

    public static CharacterVariant Create(
        int projectId,
        int projectCharacterId,
        string name,
        string? description,
        int? projectLevelId,
        int sortOrder,
        DateTime createdAt)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));
        if (projectCharacterId <= 0)
            throw new ArgumentException("Character ID must be greater than 0.", nameof(projectCharacterId));
        if (projectLevelId is <= 0)
            throw new ArgumentException("Level ID must be greater than 0 when supplied.", nameof(projectLevelId));
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Variant name is required.", nameof(name));
        if (name.Trim().Length > 200)
            throw new ArgumentException("Variant name cannot exceed 200 characters.", nameof(name));
        if (description?.Trim().Length > 2000)
            throw new ArgumentException("Variant description cannot exceed 2000 characters.", nameof(description));
        if (sortOrder < 0)
            throw new ArgumentException("Variant sort order cannot be negative.", nameof(sortOrder));

        return new CharacterVariant
        {
            ProjectId = projectId,
            ProjectCharacterId = projectCharacterId,
            Name = name.Trim(),
            Description = description?.Trim(),
            ProjectLevelId = projectLevelId,
            SortOrder = sortOrder,
            CreatedAt = createdAt
        };
    }

    public void UpdateDetails(
        string name,
        string? description,
        int? projectLevelId,
        int? sortOrder = null)
    {
        if (projectLevelId is <= 0)
            throw new ArgumentException("Level ID must be greater than 0 when supplied.", nameof(projectLevelId));
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Variant name is required.", nameof(name));
        if (name.Trim().Length > 200)
            throw new ArgumentException("Variant name cannot exceed 200 characters.", nameof(name));
        if (description?.Trim().Length > 2000)
            throw new ArgumentException("Variant description cannot exceed 2000 characters.", nameof(description));
        if (sortOrder is < 0)
            throw new ArgumentException("Variant sort order cannot be negative.", nameof(sortOrder));

        Name = name.Trim();
        Description = description?.Trim();
        ProjectLevelId = projectLevelId;
        if (sortOrder.HasValue)
            SortOrder = sortOrder.Value;
    }
}
