namespace Domain.Models;

/// <summary>A project-owned link from a character to an existing library file.</summary>
public class ProjectCharacterImage
{
    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int ProjectCharacterId { get; private set; }
    public int? FileId { get; private set; }
    public string? Title { get; private set; }
    public string? Caption { get; private set; }
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public ProjectCharacter ProjectCharacter { get; private set; } = null!;
    public File? File { get; private set; }

    public static ProjectCharacterImage Create(
        int projectId,
        int projectCharacterId,
        File file,
        string? title,
        string? caption,
        int sortOrder,
        DateTime createdAt)
    {
        ValidateProjectId(projectId);
        ValidateCharacterId(projectCharacterId);
        if (file is null)
            throw new ArgumentNullException(nameof(file));
        if (file.Id <= 0)
            throw new ArgumentException("File must have a persisted ID.", nameof(file));
        ValidateSortOrder(sortOrder);

        var normalizedTitle = NormalizeOptional(title, 200, nameof(title));
        var normalizedCaption = NormalizeOptional(caption, 2000, nameof(caption));
        return new ProjectCharacterImage
        {
            ProjectId = projectId,
            ProjectCharacterId = projectCharacterId,
            FileId = file.Id,
            File = file,
            Title = normalizedTitle,
            Caption = normalizedCaption,
            SortOrder = sortOrder,
            CreatedAt = createdAt
        };
    }

    public void UpdateDetails(string? title, string? caption, int? sortOrder = null)
    {
        var normalizedTitle = NormalizeOptional(title, 200, nameof(title));
        var normalizedCaption = NormalizeOptional(caption, 2000, nameof(caption));
        if (sortOrder.HasValue)
            ValidateSortOrder(sortOrder.Value);

        Title = normalizedTitle;
        Caption = normalizedCaption;
        if (sortOrder.HasValue)
            SortOrder = sortOrder.Value;
    }

    private static void ValidateProjectId(int projectId)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));
    }

    private static void ValidateCharacterId(int projectCharacterId)
    {
        if (projectCharacterId <= 0)
            throw new ArgumentException("Character ID must be greater than 0.", nameof(projectCharacterId));
    }

    private static void ValidateSortOrder(int sortOrder)
    {
        if (sortOrder < 0)
            throw new ArgumentException("Image sort order cannot be negative.", nameof(sortOrder));
    }

    private static string? NormalizeOptional(string? value, int maxLength, string parameterName)
    {
        var normalized = value?.Trim();
        if (normalized?.Length > maxLength)
            throw new ArgumentException($"Value cannot exceed {maxLength} characters.", parameterName);
        return string.IsNullOrEmpty(normalized) ? null : normalized;
    }
}
