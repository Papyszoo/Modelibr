namespace Domain.Models;

/// <summary>A project-owned character role or project-specific tag.</summary>
public class ProjectCharacterTag
{
    private readonly List<ProjectCharacter> _characters = new();

    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string NormalizedName { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public Project Project { get; private set; } = null!;

    public ICollection<ProjectCharacter> Characters
    {
        get => _characters;
        set
        {
            _characters.Clear();
            if (value != null)
                _characters.AddRange(value);
        }
    }

    public static ProjectCharacterTag Create(int projectId, string name, DateTime now)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));

        var sanitized = SanitizeName(name);
        return new ProjectCharacterTag
        {
            ProjectId = projectId,
            Name = sanitized,
            NormalizedName = sanitized.ToLowerInvariant(),
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    public static string NormalizeName(string name) => SanitizeName(name).ToLowerInvariant();

    private static string SanitizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Character tag name is required.", nameof(name));

        var trimmed = name.Trim();
        if (trimmed.Length > 100)
            throw new ArgumentException("Character tag name cannot exceed 100 characters.", nameof(name));
        return trimmed;
    }
}
