namespace Domain.Models;

/// <summary>
/// A visual effect: timed components (particles, meshes, lights, sounds) that play on
/// one timeline. The whole effect is ONE validated JSON definition stored as a single
/// jsonb document, not a graph of rows.
///
/// Why a document rather than component tables: the effect is authored and played as a
/// unit, like a scene document, and the browser preview and the Godot export read the
/// same numbers. A row per component would buy indexing nobody filters on and cost a
/// join on every read. The server validates the document on the way in, so what is
/// stored is always the contract the frontend and the export understand.
///
/// Deliberately no tags, categories or soft delete: an effect is a small authored
/// document, and a hard delete is unambiguous. It does carry a thumbnail - an animated
/// loop of the whole effect rendered by the worker from the app's own preview - because
/// a name alone does not say what an effect looks like.
/// </summary>
public class Vfx : AggregateRoot
{
    private readonly List<Project> _projects = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }

    /// <summary>The validated v1 definition, serialized as camelCase JSON.</summary>
    public string DefinitionJson { get; private set; } = string.Empty;

    /// <summary>
    /// Where the worker-rendered animated WebP lives, or null while none exists yet.
    /// Kept after a definition change until the re-render replaces it.
    /// </summary>
    public string? ThumbnailPath { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    // Navigation property for many-to-many relationship with Projects - EF Core requires this to be settable
    public ICollection<Project> Projects
    {
        get => _projects;
        set
        {
            _projects.Clear();
            if (value != null)
                _projects.AddRange(value);
        }
    }

    public static Vfx Create(string name, string? description, string definitionJson, DateTime now)
    {
        ValidateName(name);
        ValidateDescription(description);
        ValidateDefinition(definitionJson);

        return new Vfx
        {
            Name = name.Trim(),
            Description = description?.Trim(),
            DefinitionJson = definitionJson,
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    public void Rename(string name, DateTime updatedAt)
    {
        ValidateName(name);

        Name = name.Trim();
        UpdatedAt = updatedAt;
    }

    public void UpdateDescription(string? description, DateTime updatedAt)
    {
        ValidateDescription(description);

        Description = description?.Trim();
        UpdatedAt = updatedAt;
    }

    public void UpdateDefinition(string definitionJson, DateTime updatedAt)
    {
        ValidateDefinition(definitionJson);

        DefinitionJson = definitionJson;
        UpdatedAt = updatedAt;
    }

    public void SetThumbnailPath(string thumbnailPath, DateTime updatedAt)
    {
        if (string.IsNullOrWhiteSpace(thumbnailPath))
            throw new ArgumentException("Thumbnail path cannot be null or empty.", nameof(thumbnailPath));

        ThumbnailPath = thumbnailPath.Trim();
        UpdatedAt = updatedAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Vfx name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Vfx name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateDescription(string? description)
    {
        if (description != null && description.Length > 1000)
            throw new ArgumentException("Vfx description cannot exceed 1000 characters.", nameof(description));
    }

    private static void ValidateDefinition(string definitionJson)
    {
        if (string.IsNullOrWhiteSpace(definitionJson))
            throw new ArgumentException("Vfx definition cannot be null or empty.", nameof(definitionJson));
    }
}
