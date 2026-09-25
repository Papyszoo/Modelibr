namespace Domain.Models;

public class ProjectConceptImage
{
    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int? ProjectLevelId { get; private set; }
    public int FileId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public ProjectLevel? ProjectLevel { get; private set; }
    public File File { get; private set; } = null!;
    public ICollection<ProductionNote> Notes { get; } = new List<ProductionNote>();

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

    public void UpdateDetails(string? title, int? projectLevelId)
    {
        if (projectLevelId is <= 0)
            throw new ArgumentException("Project level ID must be greater than 0 when supplied.", nameof(projectLevelId));

        var normalizedTitle = title?.Trim() ?? string.Empty;
        if (normalizedTitle.Length > 200)
            throw new ArgumentException("Reference title cannot exceed 200 characters.", nameof(title));

        Title = normalizedTitle;
        ProjectLevelId = projectLevelId;
    }

    public void UpdateSortOrder(int sortOrder)
    {
        if (sortOrder < 0)
            throw new ArgumentException("Sort order cannot be negative.", nameof(sortOrder));

        SortOrder = sortOrder;
    }
}