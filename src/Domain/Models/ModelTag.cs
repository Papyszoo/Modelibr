namespace Domain.Models;

public class ModelTag
{
    private readonly List<Model> _models = new();

    private ModelTag() { }

    private ModelTag(string name, DateTime createdAt)
    {
        Name = name;
        NormalizedName = NormalizeName(name);
        CreatedAt = createdAt;
        UpdatedAt = createdAt;
    }

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string NormalizedName { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public ICollection<Model> Models
    {
        get => _models;
        set
        {
            _models.Clear();
            if (value != null)
            {
                _models.AddRange(value);
            }
        }
    }

    public static ModelTag Create(string name, DateTime createdAt)
    {
        var sanitizedName = SanitizeName(name);
        return new ModelTag(sanitizedName, createdAt);
    }

    public static string NormalizeName(string name)
    {
        return SanitizeName(name).ToLowerInvariant();
    }

    public static IReadOnlyList<string> SanitizeNames(IEnumerable<string>? names)
    {
        if (names == null)
        {
            return Array.Empty<string>();
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var sanitized = new List<string>();

        foreach (var name in names)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var trimmed = SanitizeName(name);
            if (seen.Add(trimmed))
            {
                sanitized.Add(trimmed);
            }
        }

        return sanitized;
    }

    private static string SanitizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Tag name cannot be null or empty.", nameof(name));
        }

        var trimmed = name.Trim();
        if (trimmed.Length > 100)
        {
            throw new ArgumentException("Tag name cannot exceed 100 characters.", nameof(name));
        }

        return trimmed;
    }
}