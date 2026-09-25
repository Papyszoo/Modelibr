namespace Domain.Models;

/// <summary>A short piece of production context targeted at the project, one level, or one reference image.</summary>
public class ProductionNote : AggregateRoot
{
    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int? LevelId { get; private set; }
    public int? ReferenceImageId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public bool IsPinned { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public ProjectLevel? Level { get; private set; }
    public ProjectConceptImage? ReferenceImage { get; private set; }

    public static ProductionNote Create(
        int projectId,
        int? levelId,
        int? referenceImageId,
        string title,
        string body,
        bool isPinned,
        DateTime now)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));

        var note = new ProductionNote
        {
            ProjectId = projectId,
            IsPinned = isPinned,
            CreatedAt = now,
            UpdatedAt = now
        };
        note.Update(levelId, referenceImageId, title, body, isPinned, now);
        return note;
    }

    public void Update(
        int? levelId,
        int? referenceImageId,
        string title,
        string body,
        bool isPinned,
        DateTime updatedAt)
    {
        if (levelId is <= 0)
            throw new ArgumentException("Level ID must be greater than 0 when supplied.", nameof(levelId));
        if (referenceImageId is <= 0)
            throw new ArgumentException("Reference image ID must be greater than 0 when supplied.", nameof(referenceImageId));
        if (levelId.HasValue && referenceImageId.HasValue)
            throw new ArgumentException("A production note can target either a level or a reference image, not both.", nameof(referenceImageId));
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Production note title is required.", nameof(title));
        if (title.Trim().Length > 200)
            throw new ArgumentException("Production note title cannot exceed 200 characters.", nameof(title));
        if (string.IsNullOrWhiteSpace(body))
            throw new ArgumentException("Production note body is required.", nameof(body));
        if (body.Trim().Length > 10_000)
            throw new ArgumentException("Production note body cannot exceed 10000 characters.", nameof(body));

        LevelId = levelId;
        ReferenceImageId = referenceImageId;
        Title = title.Trim();
        Body = body.Trim();
        IsPinned = isPinned;
        UpdatedAt = updatedAt;
    }
}
