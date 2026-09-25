namespace Domain.Models;

/// <summary>A project-owned link from a character to an existing library model.</summary>
public class ProjectCharacterModel
{
    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int ProjectCharacterId { get; private set; }
    public int? ModelId { get; private set; }
    public string? Label { get; private set; }
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public ProjectCharacter ProjectCharacter { get; private set; } = null!;
    public Model? Model { get; private set; }

    public static ProjectCharacterModel Create(
        int projectId,
        int projectCharacterId,
        Model model,
        string? label,
        int sortOrder,
        DateTime createdAt)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));
        if (projectCharacterId <= 0)
            throw new ArgumentException("Character ID must be greater than 0.", nameof(projectCharacterId));
        if (model is null)
            throw new ArgumentNullException(nameof(model));
        if (model.Id <= 0)
            throw new ArgumentException("Model must have a persisted ID.", nameof(model));
        if (sortOrder < 0)
            throw new ArgumentException("Model sort order cannot be negative.", nameof(sortOrder));

        var normalizedLabel = label?.Trim();
        if (normalizedLabel?.Length > 200)
            throw new ArgumentException("Model label cannot exceed 200 characters.", nameof(label));

        return new ProjectCharacterModel
        {
            ProjectId = projectId,
            ProjectCharacterId = projectCharacterId,
            ModelId = model.Id,
            Model = model,
            Label = string.IsNullOrEmpty(normalizedLabel) ? null : normalizedLabel,
            SortOrder = sortOrder,
            CreatedAt = createdAt
        };
    }

    public void UpdateDetails(string? label, int? sortOrder = null)
    {
        var normalizedLabel = label?.Trim();
        if (normalizedLabel?.Length > 200)
            throw new ArgumentException("Model label cannot exceed 200 characters.", nameof(label));
        if (sortOrder is < 0)
            throw new ArgumentException("Model sort order cannot be negative.", nameof(sortOrder));

        Label = string.IsNullOrEmpty(normalizedLabel) ? null : normalizedLabel;
        if (sortOrder.HasValue)
            SortOrder = sortOrder.Value;
    }
}
