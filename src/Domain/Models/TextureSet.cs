using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Represents a collection of textures grouped together as a texture set.
/// Enforces business rules such as allowing only one texture per type per set.
/// </summary>
public class TextureSet : AggregateRoot
{
    private readonly List<Texture> _textures = new();
    private readonly List<Model> _models = new();
    private readonly List<Pack> _packs = new();
    private readonly List<Project> _projects = new();

    public int Id { get; set; }
    public string Name { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    // Navigation property for the collection of textures - EF Core requires this to be settable
    public ICollection<Texture> Textures
    {
        get => _textures;
        set
        {
            _textures.Clear();
            if (value != null)
                _textures.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Models - EF Core requires this to be settable
    public ICollection<Model> Models
    {
        get => _models;
        set
        {
            _models.Clear();
            if (value != null)
                _models.AddRange(value);
        }
    }

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
    /// Creates a new TextureSet with the specified name.
    /// </summary>
    /// <param name="name">The name of the texture set</param>
    /// <param name="createdAt">When the texture set was created</param>
    /// <returns>A new TextureSet instance</returns>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public static TextureSet Create(string name, DateTime createdAt)
    {
        ValidateName(name);

        return new TextureSet
        {
            Name = name.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the name of the texture set.
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
    /// Adds a texture to the set, enforcing the business rule that only one texture per type is allowed.
    /// </summary>
    /// <param name="texture">The texture to add</param>
    /// <param name="updatedAt">When the texture was added</param>
    /// <exception cref="ArgumentNullException">Thrown when texture is null</exception>
    /// <exception cref="InvalidOperationException">Thrown when a texture of the same type already exists</exception>
    public void AddTexture(Texture texture, DateTime updatedAt)
    {
        if (texture == null)
            throw new ArgumentNullException(nameof(texture), "Texture cannot be null.");

        if (HasTextureOfType(texture.TextureType))
        {
            throw new InvalidOperationException(
                $"A texture of type '{texture.TextureType.GetDescription()}' already exists in this set. " +
                "Only one texture per type is allowed per set.");
        }

        _textures.Add(texture);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a texture from the set.
    /// </summary>
    /// <param name="texture">The texture to remove</param>
    /// <param name="updatedAt">When the texture was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when texture is null</exception>
    public void RemoveTexture(Texture texture, DateTime updatedAt)
    {
        if (texture == null)
            throw new ArgumentNullException(nameof(texture), "Texture cannot be null.");

        if (_textures.Remove(texture))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Removes a texture of the specified type from the set.
    /// </summary>
    /// <param name="textureType">The type of texture to remove</param>
    /// <param name="updatedAt">When the texture was removed</param>
    /// <returns>True if a texture was removed, false if no texture of that type was found</returns>
    public bool RemoveTextureOfType(TextureType textureType, DateTime updatedAt)
    {
        var textureToRemove = _textures.FirstOrDefault(t => t.TextureType == textureType);
        if (textureToRemove != null)
        {
            _textures.Remove(textureToRemove);
            UpdatedAt = updatedAt;
            return true;
        }

        return false;
    }

    /// <summary>
    /// Checks if the set contains a texture of the specified type.
    /// </summary>
    /// <param name="textureType">The texture type to check</param>
    /// <returns>True if a texture of the specified type exists</returns>
    public bool HasTextureOfType(TextureType textureType)
    {
        return _textures.Any(t => t.TextureType == textureType);
    }

    /// <summary>
    /// Gets the texture of the specified type, if it exists.
    /// </summary>
    /// <param name="textureType">The texture type to find</param>
    /// <returns>The texture of the specified type, or null if not found</returns>
    public Texture? GetTextureOfType(TextureType textureType)
    {
        return _textures.FirstOrDefault(t => t.TextureType == textureType);
    }

    /// <summary>
    /// Gets all texture types currently in the set.
    /// </summary>
    /// <returns>Read-only list of texture types</returns>
    public IReadOnlyList<TextureType> GetTextureTypes()
    {
        return _textures.Select(t => t.TextureType).ToList().AsReadOnly();
    }

    /// <summary>
    /// Gets the number of textures in the set.
    /// </summary>
    /// <returns>The count of textures</returns>
    public int TextureCount => _textures.Count;

    /// <summary>
    /// Checks if the texture set is empty (contains no textures).
    /// </summary>
    /// <returns>True if the set contains no textures</returns>
    public bool IsEmpty => _textures.Count == 0;

    /// <summary>
    /// Associates a model with this texture set.
    /// </summary>
    /// <param name="model">The model to associate</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when model is null</exception>
    public void AddModel(Model model, DateTime updatedAt)
    {
        if (model == null)
            throw new ArgumentNullException(nameof(model));

        if (_models.Any(m => m.Id == model.Id))
            return; // Model already associated

        _models.Add(model);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a model association from this texture set.
    /// </summary>
    /// <param name="model">The model to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when model is null</exception>
    public void RemoveModel(Model model, DateTime updatedAt)
    {
        if (model == null)
            throw new ArgumentNullException(nameof(model));

        if (_models.Remove(model))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this texture set is associated with a model with the specified ID.
    /// </summary>
    /// <param name="modelId">The model ID to check</param>
    /// <returns>True if the model is associated with this texture set</returns>
    public bool HasModel(int modelId)
    {
        return _models.Any(m => m.Id == modelId);
    }

    /// <summary>
    /// Gets all models associated with this texture set.
    /// </summary>
    /// <returns>Read-only list of associated models</returns>
    public IReadOnlyList<Model> GetModels()
    {
        return _models.AsReadOnly();
    }

    /// <summary>
    /// Gets a human-readable description of the texture set.
    /// </summary>
    /// <returns>Description including name and texture count</returns>
    public string GetDescription()
    {
        var textureTypesDescription = _textures.Count > 0
            ? string.Join(", ", _textures.Select(t => t.TextureType.GetDescription()))
            : "No textures";

        return $"{Name} ({_textures.Count} textures: {textureTypesDescription})";
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Texture set name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Texture set name cannot exceed 200 characters.", nameof(name));
    }

    /// <summary>
    /// Soft deletes this texture set by marking it as deleted.
    /// </summary>
    /// <param name="deletedAt">When the texture set was deleted</param>
    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;
    }

    /// <summary>
    /// Restores a soft-deleted texture set.
    /// </summary>
    /// <param name="restoredAt">When the texture set was restored</param>
    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;
    }
}