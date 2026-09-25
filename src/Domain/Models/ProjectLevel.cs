using Domain.Projects;

namespace Domain.Models;

/// <summary>A focused production unit within a project.</summary>
public class ProjectLevel : AggregateRoot
{
    private readonly List<Scene> _scenes = new();
    private readonly List<ProjectConceptImage> _conceptImages = new();
    private readonly List<ProductionNote> _notes = new();

    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public string ProductionStatus { get; private set; } = ProjectLevelStatuses.Planned;
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public Project Project { get; private set; } = null!;

    public ICollection<Scene> Scenes
    {
        get => _scenes;
        set
        {
            _scenes.Clear();
            if (value is not null) _scenes.AddRange(value);
        }
    }

    public ICollection<ProjectConceptImage> ConceptImages
    {
        get => _conceptImages;
        set
        {
            _conceptImages.Clear();
            if (value is not null) _conceptImages.AddRange(value);
        }
    }

    public ICollection<ProductionNote> Notes
    {
        get => _notes;
        set
        {
            _notes.Clear();
            if (value is not null) _notes.AddRange(value);
        }
    }

    public static ProjectLevel Create(
        int projectId,
        string name,
        string? description,
        string productionStatus,
        int sortOrder,
        DateTime now)
    {
        ValidateProjectId(projectId);
        var level = new ProjectLevel
        {
            ProjectId = projectId,
            SortOrder = sortOrder,
            CreatedAt = now,
            UpdatedAt = now
        };
        level.Update(name, description, productionStatus, sortOrder, now);
        return level;
    }

    public void Update(
        string name,
        string? description,
        string productionStatus,
        int sortOrder,
        DateTime updatedAt)
    {
        ValidateName(name);
        ValidateDescription(description);
        ValidateSortOrder(sortOrder);

        Name = name.Trim();
        Description = description?.Trim();
        ProductionStatus = ProjectLevelStatuses.Normalize(productionStatus);
        SortOrder = sortOrder;
        UpdatedAt = updatedAt;
    }

    private static void ValidateProjectId(int projectId)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Level name is required.", nameof(name));

        if (name.Trim().Length > 200)
            throw new ArgumentException("Level name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateDescription(string? description)
    {
        if (description?.Trim().Length > 2000)
            throw new ArgumentException("Level description cannot exceed 2000 characters.", nameof(description));
    }

    private static void ValidateSortOrder(int sortOrder)
    {
        if (sortOrder < 0)
            throw new ArgumentException("Level sort order cannot be negative.", nameof(sortOrder));
    }
}
