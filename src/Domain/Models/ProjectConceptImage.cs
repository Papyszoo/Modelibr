namespace Domain.Models;

public class ProjectConceptImage
{
    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int FileId { get; private set; }
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public File File { get; private set; } = null!;

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

    public void UpdateSortOrder(int sortOrder)
    {
        if (sortOrder < 0)
            throw new ArgumentException("Sort order cannot be negative.", nameof(sortOrder));

        SortOrder = sortOrder;
    }
}