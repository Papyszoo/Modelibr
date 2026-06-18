namespace Domain.Models;

/// <summary>
/// Represents a script / source-code asset (e.g. .lua, .cs, .cpp, .py).
/// Scripts wrap a text file, can be categorized, and their content is editable
/// in-app — editing re-points the script to a new content-addressed file.
/// </summary>
public class Script : AggregateRoot
{
    private readonly List<Pack> _packs = new();
    private readonly List<Project> _projects = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public int FileId { get; private set; }
    public int? ScriptCategoryId { get; private set; }

    /// <summary>
    /// Highlight language id (e.g. "lua", "python", "csharp"), derived from the
    /// file extension at upload time and consumed by the frontend code editor.
    /// </summary>
    public string Language { get; private set; } = string.Empty;

    /// <summary>Number of lines of source, computed from the file content.</summary>
    public int LineCount { get; private set; }

    /// <summary>Size of the current content in bytes.</summary>
    public long SizeBytes { get; private set; }

    /// <summary>Optional free-text description / notes about the script.</summary>
    public string? Description { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    // Navigation property for the associated file
    public File File { get; private set; } = null!;

    // Navigation property for the optional category
    public ScriptCategory? Category { get; set; }

    // Navigation property for many-to-many relationship with Packs - EF Core requires this to be settable
    public ICollection<Pack> Packs
    {
        get => _packs;
        set
        {
            _packs.Clear();
            if (value != null)
                _packs.AddRange(value);
        }
    }

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

    /// <summary>
    /// Creates a new Script with the specified file and metadata.
    /// </summary>
    public static Script Create(string name, File file, string language, int lineCount, long sizeBytes, DateTime createdAt, int? categoryId = null, string? description = null)
    {
        ValidateName(name);
        ValidateFile(file);
        ValidateLanguage(language);
        ValidateDescription(description);

        return new Script
        {
            Name = name.Trim(),
            FileId = file.Id,
            File = file,
            Language = language.Trim().ToLowerInvariant(),
            LineCount = lineCount < 0 ? 0 : lineCount,
            SizeBytes = sizeBytes < 0 ? 0 : sizeBytes,
            ScriptCategoryId = categoryId,
            Description = NormalizeDescription(description),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>Updates the name of the script.</summary>
    public void UpdateName(string name, DateTime updatedAt)
    {
        ValidateName(name);

        Name = name.Trim();
        UpdatedAt = updatedAt;
    }

    /// <summary>Updates the optional description (null/blank clears it).</summary>
    public void UpdateDescription(string? description, DateTime updatedAt)
    {
        ValidateDescription(description);

        Description = NormalizeDescription(description);
        UpdatedAt = updatedAt;
    }

    /// <summary>Updates the category of the script (null removes the category).</summary>
    public void UpdateCategory(int? categoryId, DateTime updatedAt)
    {
        ScriptCategoryId = categoryId;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Re-points the script at edited content. Content-addressed storage means a
    /// save produces a new <see cref="File"/>; this swaps the reference and
    /// refreshes the derived metadata.
    /// </summary>
    public void UpdateContent(File file, int lineCount, long sizeBytes, DateTime updatedAt)
    {
        ValidateFile(file);

        FileId = file.Id;
        File = file;
        LineCount = lineCount < 0 ? 0 : lineCount;
        SizeBytes = sizeBytes < 0 ? 0 : sizeBytes;
        UpdatedAt = updatedAt;
    }

    /// <summary>Soft deletes this script by marking it as deleted.</summary>
    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;
    }

    /// <summary>Restores a soft-deleted script.</summary>
    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Script name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Script name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateFile(File? file)
    {
        if (file is null)
            throw new ArgumentNullException(nameof(file), "File cannot be null.");
    }

    private static void ValidateLanguage(string language)
    {
        if (string.IsNullOrWhiteSpace(language))
            throw new ArgumentException("Script language cannot be null or empty.", nameof(language));

        if (language.Length > 50)
            throw new ArgumentException("Script language cannot exceed 50 characters.", nameof(language));
    }

    private static void ValidateDescription(string? description)
    {
        if (description is not null && description.Length > 2000)
            throw new ArgumentException("Script description cannot exceed 2000 characters.", nameof(description));
    }

    private static string? NormalizeDescription(string? description)
        => string.IsNullOrWhiteSpace(description) ? null : description.Trim();
}
