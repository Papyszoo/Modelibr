using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Represents a sprite asset that can be either static or animated.
/// Sprites can be associated with projects, packs, and optionally categorized.
/// </summary>
public class Sprite : AggregateRoot
{
    private readonly List<Pack> _packs = new();
    private readonly List<Project> _projects = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public int FileId { get; private set; }
    public SpriteType SpriteType { get; private set; }
    public int? SpriteCategoryId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    // Navigation property for the associated file
    public File File { get; private set; } = null!;

    // Navigation property for the optional category
    public SpriteCategory? Category { get; set; }

    // Navigation property for one-to-one relationship with thumbnail
    public Thumbnail? Thumbnail { get; set; }

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
    /// Creates a new Sprite with the specified file and type.
    /// </summary>
    /// <param name="name">The name of the sprite</param>
    /// <param name="file">The file containing the sprite data</param>
    /// <param name="spriteType">The type of sprite (Static, SpriteSheet, Gif, etc.)</param>
    /// <param name="createdAt">When the sprite was created</param>
    /// <param name="categoryId">Optional category ID</param>
    /// <returns>A new Sprite instance</returns>
    /// <exception cref="ArgumentNullException">Thrown when file is null</exception>
    /// <exception cref="ArgumentException">Thrown when validation fails</exception>
    public static Sprite Create(string name, File file, SpriteType spriteType, DateTime createdAt, int? categoryId = null)
    {
        ValidateName(name);
        ValidateFile(file);
        ValidateSpriteType(spriteType);

        return new Sprite
        {
            Name = name.Trim(),
            FileId = file.Id,
            File = file,
            SpriteType = spriteType,
            SpriteCategoryId = categoryId,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the name of the sprite.
    /// </summary>
    /// <param name="name">The new name</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public void UpdateName(string name, DateTime updatedAt)
    {
        ValidateName(name);

        Name = name.Trim();
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the sprite type.
    /// </summary>
    /// <param name="spriteType">The new sprite type</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when sprite type is invalid</exception>
    public void UpdateSpriteType(SpriteType spriteType, DateTime updatedAt)
    {
        ValidateSpriteType(spriteType);

        SpriteType = spriteType;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the category of the sprite.
    /// </summary>
    /// <param name="categoryId">The new category ID, or null to remove category</param>
    /// <param name="updatedAt">When the update occurred</param>
    public void UpdateCategory(int? categoryId, DateTime updatedAt)
    {
        SpriteCategoryId = categoryId;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Sets the thumbnail for this sprite.
    /// </summary>
    /// <param name="thumbnail">The thumbnail to associate with this sprite</param>
    public void SetThumbnail(Thumbnail thumbnail)
    {
        if (thumbnail == null)
            throw new ArgumentNullException(nameof(thumbnail));

        Thumbnail = thumbnail;
    }

    /// <summary>
    /// Checks if this sprite is of the specified type.
    /// </summary>
    /// <param name="spriteType">The sprite type to check</param>
    /// <returns>True if the sprite matches the specified type</returns>
    public bool IsOfType(SpriteType spriteType)
    {
        return SpriteType == spriteType;
    }

    /// <summary>
    /// Checks if this sprite is animated.
    /// </summary>
    /// <returns>True if the sprite is animated</returns>
    public bool IsAnimated()
    {
        return SpriteType.IsAnimated();
    }

    /// <summary>
    /// Gets a human-readable description of this sprite.
    /// </summary>
    /// <returns>Description combining name and sprite type</returns>
    public string GetDescription()
    {
        return $"{Name} ({SpriteType.GetDescription()})";
    }

    /// <summary>
    /// Soft deletes this sprite by marking it as deleted.
    /// </summary>
    /// <param name="deletedAt">When the sprite was deleted</param>
    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;
    }

    /// <summary>
    /// Restores a soft-deleted sprite.
    /// </summary>
    /// <param name="restoredAt">When the sprite was restored</param>
    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Sprite name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Sprite name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateFile(File? file)
    {
        if (file is null)
            throw new ArgumentNullException(nameof(file), "File cannot be null.");
    }

    private static void ValidateSpriteType(SpriteType spriteType)
    {
        var validationResult = spriteType.ValidateForStorage();
        if (validationResult.IsFailure)
        {
            throw new ArgumentException(validationResult.Error.Message, nameof(spriteType));
        }
    }
}
