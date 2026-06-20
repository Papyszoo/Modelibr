namespace Domain.Models;

/// <summary>
/// A reusable starting point for a new script (e.g. a Unity MonoBehaviour or a
/// three.js shader). Custom templates are user-authored and stored in the
/// database; built-in templates ship with the app and live in code.
/// </summary>
public class ScriptTemplate : AggregateRoot
{
    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;

    /// <summary>Highlight language id this template produces (e.g. "csharp", "glsl").</summary>
    public string Language { get; private set; } = string.Empty;

    /// <summary>The boilerplate source the new script starts from.</summary>
    public string Content { get; private set; } = string.Empty;

    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public static ScriptTemplate Create(string name, string language, string content, DateTime createdAt, string? description = null)
    {
        ValidateName(name);
        ValidateLanguage(language);
        ValidateDescription(description);

        return new ScriptTemplate
        {
            Name = name.Trim(),
            Language = language.Trim().ToLowerInvariant(),
            Content = content ?? string.Empty,
            Description = NormalizeDescription(description),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void Update(string name, string language, string content, DateTime updatedAt, string? description = null)
    {
        ValidateName(name);
        ValidateLanguage(language);
        ValidateDescription(description);

        Name = name.Trim();
        Language = language.Trim().ToLowerInvariant();
        Content = content ?? string.Empty;
        Description = NormalizeDescription(description);
        UpdatedAt = updatedAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Template name cannot be null or empty.", nameof(name));
        if (name.Length > 200)
            throw new ArgumentException("Template name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateLanguage(string language)
    {
        if (string.IsNullOrWhiteSpace(language))
            throw new ArgumentException("Template language cannot be null or empty.", nameof(language));
        if (language.Length > 50)
            throw new ArgumentException("Template language cannot exceed 50 characters.", nameof(language));
    }

    private static void ValidateDescription(string? description)
    {
        if (description is not null && description.Length > 2000)
            throw new ArgumentException("Template description cannot exceed 2000 characters.", nameof(description));
    }

    private static string? NormalizeDescription(string? description)
        => string.IsNullOrWhiteSpace(description) ? null : description.Trim();
}
