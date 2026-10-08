namespace Domain.Models;

public class ProjectConceptImage
{
    private readonly List<ProjectReferenceLink> _links = new();

    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int FileId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public File File { get; private set; } = null!;
    public ICollection<ProjectComment> Comments { get; } = new List<ProjectComment>();

    public ICollection<ProjectReferenceLink> Links
    {
        get => _links;
        set
        {
            _links.Clear();
            if (value != null)
                _links.AddRange(value);
        }
    }

    public static ProjectConceptImage Create(int projectId, int fileId, int sortOrder, DateTime createdAt)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));

        if (fileId <= 0)
            throw new ArgumentException("File ID must be greater than 0.", nameof(fileId));

        if (sortOrder < 0)
            throw new ArgumentException("Sort order cannot be negative.", nameof(sortOrder));

        return new ProjectConceptImage
        {
            ProjectId = projectId,
            FileId = fileId,
            SortOrder = sortOrder,
            CreatedAt = createdAt
        };
    }

    public void UpdateDetails(string? title)
    {
        var normalizedTitle = title?.Trim() ?? string.Empty;
        if (normalizedTitle.Length > 200)
            throw new ArgumentException("Reference title cannot exceed 200 characters.", nameof(title));

        Title = normalizedTitle;
    }

    public void UpdateSortOrder(int sortOrder)
    {
        if (sortOrder < 0)
            throw new ArgumentException("Sort order cannot be negative.", nameof(sortOrder));

        SortOrder = sortOrder;
    }

    /// <summary>Adds a target link, rejecting a duplicate link to the same target.</summary>
    public ProjectReferenceLink AddLink(int? projectLevelId, int? projectCharacterId, DateTime createdAt)
    {
        var link = ProjectReferenceLink.Create(
            ProjectId,
            Id,
            projectLevelId,
            projectCharacterId,
            createdAt);

        if (projectLevelId.HasValue && _links.Any(existing => existing.TargetsLevel(projectLevelId.Value)))
            throw new ArgumentException("This reference is already linked to that level.", nameof(projectLevelId));

        if (projectCharacterId.HasValue && _links.Any(existing => existing.TargetsCharacter(projectCharacterId.Value)))
            throw new ArgumentException("This reference is already linked to that character.", nameof(projectCharacterId));

        _links.Add(link);
        return link;
    }

    public bool RemoveLink(int linkId) => _links.RemoveAll(link => link.Id == linkId) > 0;

    public bool IsLinkedToLevel(int levelId) => _links.Any(link => link.TargetsLevel(levelId));

    public bool IsLinkedToCharacter(int characterId) => _links.Any(link => link.TargetsCharacter(characterId));
}
