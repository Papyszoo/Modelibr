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
    private readonly List<ModelVersion> _modelVersions = new();
    private readonly List<Pack> _packs = new();
    private readonly List<Project> _projects = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public TextureSetKind Kind { get; private set; } = TextureSetKind.ModelSpecific;
    public float TilingScaleX { get; private set; } = 1.0f;
    public float TilingScaleY { get; private set; } = 1.0f;
    
    /// <summary>
    /// UV mapping mode controlling how textures are projected onto geometry.
    /// Only relevant for Universal (Global Material) sets.
    /// Standard = direct repeat values; Physical = auto-computed from geometry dimensions.
    /// </summary>
    public UvMappingMode UvMappingMode { get; private set; } = UvMappingMode.Standard;
    
    /// <summary>
    /// Physical UV scale — the world-space size of one texture tile.
    /// Used in Physical UV mapping mode to maintain consistent texel density.
    /// Larger values = bigger tiles (fewer repeats), smaller values = smaller tiles (more repeats).
    /// Only relevant for Universal sets in Physical mode.
    /// </summary>
    public float UvScale { get; private set; } = 1.0f;
    
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    
    /// <summary>
    /// File path for the WebP thumbnail (for Universal texture sets rendered on a sphere).
    /// </summary>
    public string? ThumbnailPath { get; private set; }
    
    /// <summary>
    /// File path for the PNG thumbnail variant.
    /// </summary>
    public string? PngThumbnailPath { get; private set; }

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
    // DEPRECATED: Use ModelVersions instead for new associations
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

    // Navigation property for many-to-many relationship with ModelVersions - EF Core requires this to be settable
    public ICollection<ModelVersion> ModelVersions
    {
        get => _modelVersions;
        set
        {
            _modelVersions.Clear();
            if (value != null)
                _modelVersions.AddRange(value);
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
    /// Creates a new TextureSet with the specified name and kind.
    /// </summary>
    /// <param name="name">The name of the texture set</param>
    /// <param name="createdAt">When the texture set was created</param>
    /// <param name="kind">The kind of texture set (ModelSpecific or Universal). Defaults to ModelSpecific.</param>
    /// <returns>A new TextureSet instance</returns>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public static TextureSet Create(string name, DateTime createdAt, TextureSetKind kind = TextureSetKind.ModelSpecific)
    {
        ValidateName(name);

        return new TextureSet
        {
            Name = name.Trim(),
            Kind = kind,
            TilingScaleX = kind == TextureSetKind.Universal ? 1.0f : 1.0f,
            TilingScaleY = kind == TextureSetKind.Universal ? 1.0f : 1.0f,
            UvMappingMode = kind == TextureSetKind.Universal ? UvMappingMode.Physical : UvMappingMode.Standard,
            UvScale = 1.0f,
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
    /// Updates the kind of the texture set.
    /// </summary>
    /// <param name="kind">The new kind</param>
    /// <param name="updatedAt">When the update occurred</param>
    public void UpdateKind(TextureSetKind kind, DateTime updatedAt)
    {
        Kind = kind;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the tiling scale for universal (tileable) texture sets.
    /// </summary>
    /// <param name="tilingScaleX">Horizontal tiling scale factor</param>
    /// <param name="tilingScaleY">Vertical tiling scale factor</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="InvalidOperationException">Thrown when called on a ModelSpecific texture set</exception>
    /// <exception cref="ArgumentException">Thrown when scale values are not positive</exception>
    public void UpdateTilingScale(float tilingScaleX, float tilingScaleY, DateTime updatedAt)
    {
        if (Kind != TextureSetKind.Universal)
            throw new InvalidOperationException("Tiling scale can only be set on Universal texture sets.");

        if (tilingScaleX <= 0)
            throw new ArgumentException("Tiling scale X must be a positive value.", nameof(tilingScaleX));

        if (tilingScaleY <= 0)
            throw new ArgumentException("Tiling scale Y must be a positive value.", nameof(tilingScaleY));

        TilingScaleX = tilingScaleX;
        TilingScaleY = tilingScaleY;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the UV mapping mode and scale for universal (tileable) texture sets.
    /// </summary>
    /// <param name="uvMappingMode">The UV mapping mode (Standard or Physical)</param>
    /// <param name="uvScale">Physical UV scale — world-space size of one texture tile</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="InvalidOperationException">Thrown when called on a ModelSpecific texture set</exception>
    /// <exception cref="ArgumentException">Thrown when uvScale is not positive</exception>
    public void UpdateUvMapping(UvMappingMode uvMappingMode, float uvScale, DateTime updatedAt)
    {
        if (Kind != TextureSetKind.Universal)
            throw new InvalidOperationException("UV mapping settings can only be changed on Universal texture sets.");

        if (uvScale <= 0)
            throw new ArgumentException("UV scale must be a positive value.", nameof(uvScale));

        UvMappingMode = uvMappingMode;
        UvScale = uvScale;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Sets the WebP thumbnail path for this texture set.
    /// </summary>
    public void SetThumbnailPath(string thumbnailPath, DateTime updatedAt)
    {
        if (string.IsNullOrWhiteSpace(thumbnailPath))
            throw new ArgumentException("Thumbnail path cannot be null or empty.", nameof(thumbnailPath));

        ThumbnailPath = thumbnailPath.Trim();
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Sets the PNG thumbnail path for this texture set.
    /// </summary>
    public void SetPngThumbnailPath(string pngThumbnailPath, DateTime updatedAt)
    {
        if (string.IsNullOrWhiteSpace(pngThumbnailPath))
            throw new ArgumentException("PNG thumbnail path cannot be null or empty.", nameof(pngThumbnailPath));

        PngThumbnailPath = pngThumbnailPath.Trim();
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Adds a texture to the set, enforcing the business rule that only one texture per type is allowed.
    /// Also enforces mutual exclusivity of Height, Displacement, and Bump types.
    /// </summary>
    /// <param name="texture">The texture to add</param>
    /// <param name="updatedAt">When the texture was added</param>
    /// <exception cref="ArgumentNullException">Thrown when texture is null</exception>
    /// <exception cref="InvalidOperationException">Thrown when a texture of the same type already exists, or when Height/Displacement/Bump exclusivity is violated</exception>
    public void AddTexture(Texture texture, DateTime updatedAt)
    {
        if (texture == null)
            throw new ArgumentNullException(nameof(texture), "Texture cannot be null.");

        // Check for duplicates - TextureType.SplitChannel is exempt from uniqueness rule
        if (texture.TextureType != TextureType.SplitChannel && HasTextureOfType(texture.TextureType))
        {
            throw new InvalidOperationException(
                $"A texture of type '{texture.TextureType.GetDescription()}' already exists in this set. " +
                "Only one texture per type is allowed per set.");
        }

        // Validate mutual exclusivity of Height, Displacement, and Bump types
        if (texture.TextureType.IsHeightRelatedType())
        {
            var existingHeightType = _textures.FirstOrDefault(t => t.TextureType.IsHeightRelatedType());
            if (existingHeightType != null)
            {
                throw new InvalidOperationException(
                    $"Cannot add '{texture.TextureType}' because '{existingHeightType.TextureType}' already exists in this set. " +
                    "Only one of Height, Displacement, or Bump can be assigned per texture set.");
            }
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
    /// DEPRECATED: Use AddModelVersion instead for new associations.
    /// </summary>
    /// <param name="model">The model to associate</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when model is null</exception>
    [Obsolete("Use AddModelVersion instead to associate with specific model versions.")]
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
    /// DEPRECATED: Use RemoveModelVersion instead.
    /// </summary>
    /// <param name="model">The model to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when model is null</exception>
    [Obsolete("Use RemoveModelVersion instead to disassociate from specific model versions.")]
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
    /// DEPRECATED: Use HasModelVersion instead.
    /// </summary>
    /// <param name="modelId">The model ID to check</param>
    /// <returns>True if the model is associated with this texture set</returns>
    [Obsolete("Use HasModelVersion instead to check specific model version associations.")]
    public bool HasModel(int modelId)
    {
        return _models.Any(m => m.Id == modelId);
    }

    /// <summary>
    /// Gets all models associated with this texture set.
    /// DEPRECATED: Use GetModelVersions instead.
    /// </summary>
    /// <returns>Read-only list of associated models</returns>
    [Obsolete("Use GetModelVersions instead to get specific model version associations.")]
    public IReadOnlyList<Model> GetModels()
    {
        return _models.AsReadOnly();
    }

    /// <summary>
    /// Associates a model version with this texture set.
    /// </summary>
    /// <param name="modelVersion">The model version to associate</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when modelVersion is null</exception>
    public void AddModelVersion(ModelVersion modelVersion, DateTime updatedAt)
    {
        if (modelVersion == null)
            throw new ArgumentNullException(nameof(modelVersion));

        if (_modelVersions.Any(mv => mv.Id == modelVersion.Id))
            return; // Model version already associated

        _modelVersions.Add(modelVersion);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a model version association from this texture set.
    /// </summary>
    /// <param name="modelVersion">The model version to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when modelVersion is null</exception>
    public void RemoveModelVersion(ModelVersion modelVersion, DateTime updatedAt)
    {
        if (modelVersion == null)
            throw new ArgumentNullException(nameof(modelVersion));

        if (_modelVersions.Remove(modelVersion))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this texture set is associated with a model version with the specified ID.
    /// </summary>
    /// <param name="modelVersionId">The model version ID to check</param>
    /// <returns>True if the model version is associated with this texture set</returns>
    public bool HasModelVersion(int modelVersionId)
    {
        return _modelVersions.Any(mv => mv.Id == modelVersionId);
    }

    /// <summary>
    /// Gets all model versions associated with this texture set.
    /// </summary>
    /// <returns>Read-only list of associated model versions</returns>
    public IReadOnlyList<ModelVersion> GetModelVersions()
    {
        return _modelVersions.AsReadOnly();
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