namespace Domain.Models;

/// <summary>
/// Represents a project/folder that groups models, texture sets, sprites, and sounds together.
/// Provides organization and categorization for 3D assets.
/// </summary>
public class Project : AggregateRoot
{
    private readonly List<Model> _models = new();
    private readonly List<TextureSet> _textureSets = new();
    private readonly List<Sprite> _sprites = new();
    private readonly List<Sound> _sounds = new();
    private readonly List<EnvironmentMap> _environmentMaps = new();
    private readonly List<ProjectConceptImage> _conceptImages = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public string? Notes { get; private set; }
    public int? CustomThumbnailFileId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public File? CustomThumbnailFile { get; private set; }

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

    // Navigation property for many-to-many relationship with TextureSets - EF Core requires this to be settable
    public ICollection<TextureSet> TextureSets
    {
        get => _textureSets;
        set
        {
            _textureSets.Clear();
            if (value != null)
                _textureSets.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Sprites - EF Core requires this to be settable
    public ICollection<Sprite> Sprites
    {
        get => _sprites;
        set
        {
            _sprites.Clear();
            if (value != null)
                _sprites.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Sounds - EF Core requires this to be settable
    public ICollection<Sound> Sounds
    {
        get => _sounds;
        set
        {
            _sounds.Clear();
            if (value != null)
                _sounds.AddRange(value);
        }
    }

    public ICollection<EnvironmentMap> EnvironmentMaps
    {
        get => _environmentMaps;
        set
        {
            _environmentMaps.Clear();
            if (value != null)
                _environmentMaps.AddRange(value);
        }
    }

    public ICollection<ProjectConceptImage> ConceptImages
    {
        get => _conceptImages;
        set
        {
            _conceptImages.Clear();
            if (value != null)
                _conceptImages.AddRange(value);
        }
    }

    /// <summary>
    /// Creates a new Project with the specified name and optional description.
    /// </summary>
    /// <param name="name">The name of the project</param>
    /// <param name="description">Optional description of the project</param>
    /// <param name="createdAt">When the project was created</param>
    /// <returns>A new Project instance</returns>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public static Project Create(string name, string? description, DateTime createdAt)
    {
        return Create(name, description, null, createdAt);
    }

    public static Project Create(string name, string? description, string? notes, DateTime createdAt)
    {
        ValidateName(name);
        ValidateNotes(notes);

        if (description != null && description.Length > 1000)
            throw new ArgumentException("Project description cannot exceed 1000 characters.", nameof(description));

        return new Project
        {
            Name = name.Trim(),
            Description = description?.Trim(),
            Notes = notes?.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the name and description of the project.
    /// </summary>
    /// <param name="name">The new name</param>
    /// <param name="description">The new description</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public void Update(string name, string? description, DateTime updatedAt)
    {
        Update(name, description, null, updatedAt);
    }

    public void Update(string name, string? description, string? notes, DateTime updatedAt)
    {
        ValidateName(name);
        ValidateNotes(notes);

        if (description != null && description.Length > 1000)
            throw new ArgumentException("Project description cannot exceed 1000 characters.", nameof(description));

        Name = name.Trim();
        Description = description?.Trim();
        Notes = notes?.Trim();
        UpdatedAt = updatedAt;
    }

    public void SetCustomThumbnail(File? file, DateTime updatedAt)
    {
        CustomThumbnailFileId = file?.Id;
        CustomThumbnailFile = file;
        UpdatedAt = updatedAt;
    }

    public void AddConceptImage(File file, DateTime createdAt)
    {
        ArgumentNullException.ThrowIfNull(file);

        if (_conceptImages.Any(ci => ci.FileId == file.Id))
            return;

        var nextSortOrder = _conceptImages.Count == 0 ? 0 : _conceptImages.Max(ci => ci.SortOrder) + 1;
        _conceptImages.Add(ProjectConceptImage.Create(Id, file.Id, nextSortOrder, createdAt));
        UpdatedAt = createdAt;
    }

    public void RemoveConceptImage(int fileId, DateTime updatedAt)
    {
        var conceptImage = _conceptImages.FirstOrDefault(ci => ci.FileId == fileId);
        if (conceptImage == null)
            return;

        _conceptImages.Remove(conceptImage);
        UpdatedAt = updatedAt;
    }

    public IReadOnlyList<ProjectConceptImage> GetConceptImages()
    {
        return _conceptImages.OrderBy(ci => ci.SortOrder).ToList().AsReadOnly();
    }

    /// <summary>
    /// Adds a model to this project.
    /// </summary>
    /// <param name="model">The model to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when model is null</exception>
    public void AddModel(Model model, DateTime updatedAt)
    {
        if (model == null)
            throw new ArgumentNullException(nameof(model));

        if (_models.Any(m => m.Id == model.Id))
            return; // Model already in project

        _models.Add(model);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a model from this project.
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
    /// Checks if this project contains a model with the specified ID.
    /// </summary>
    /// <param name="modelId">The model ID to check</param>
    /// <returns>True if the model is in this project</returns>
    public bool HasModel(int modelId)
    {
        return _models.Any(m => m.Id == modelId);
    }

    /// <summary>
    /// Gets all models in this project.
    /// </summary>
    /// <returns>Read-only list of models</returns>
    public IReadOnlyList<Model> GetModels()
    {
        return _models.AsReadOnly();
    }

    /// <summary>
    /// Adds a texture set to this project.
    /// </summary>
    /// <param name="textureSet">The texture set to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when textureSet is null</exception>
    public void AddTextureSet(TextureSet textureSet, DateTime updatedAt)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        if (_textureSets.Any(ts => ts.Id == textureSet.Id))
            return; // Texture set already in project

        _textureSets.Add(textureSet);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a texture set from this project.
    /// </summary>
    /// <param name="textureSet">The texture set to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when textureSet is null</exception>
    public void RemoveTextureSet(TextureSet textureSet, DateTime updatedAt)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        if (_textureSets.Remove(textureSet))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this project contains a texture set with the specified ID.
    /// </summary>
    /// <param name="textureSetId">The texture set ID to check</param>
    /// <returns>True if the texture set is in this project</returns>
    public bool HasTextureSet(int textureSetId)
    {
        return _textureSets.Any(ts => ts.Id == textureSetId);
    }

    /// <summary>
    /// Gets all texture sets in this project.
    /// </summary>
    /// <returns>Read-only list of texture sets</returns>
    public IReadOnlyList<TextureSet> GetTextureSets()
    {
        return _textureSets.AsReadOnly();
    }

    /// <summary>
    /// Adds a sprite to this project.
    /// </summary>
    /// <param name="sprite">The sprite to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when sprite is null</exception>
    public void AddSprite(Sprite sprite, DateTime updatedAt)
    {
        if (sprite == null)
            throw new ArgumentNullException(nameof(sprite));

        if (_sprites.Any(s => s.Id == sprite.Id))
            return; // Sprite already in project

        _sprites.Add(sprite);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a sprite from this project.
    /// </summary>
    /// <param name="sprite">The sprite to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when sprite is null</exception>
    public void RemoveSprite(Sprite sprite, DateTime updatedAt)
    {
        if (sprite == null)
            throw new ArgumentNullException(nameof(sprite));

        if (_sprites.Remove(sprite))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this project contains a sprite with the specified ID.
    /// </summary>
    /// <param name="spriteId">The sprite ID to check</param>
    /// <returns>True if the sprite is in this project</returns>
    public bool HasSprite(int spriteId)
    {
        return _sprites.Any(s => s.Id == spriteId);
    }

    /// <summary>
    /// Gets all sprites in this project.
    /// </summary>
    /// <returns>Read-only list of sprites</returns>
    public IReadOnlyList<Sprite> GetSprites()
    {
        return _sprites.AsReadOnly();
    }

    /// <summary>
    /// Adds a sound to this project.
    /// </summary>
    /// <param name="sound">The sound to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when sound is null</exception>
    public void AddSound(Sound sound, DateTime updatedAt)
    {
        if (sound == null)
            throw new ArgumentNullException(nameof(sound));

        if (_sounds.Any(s => s.Id == sound.Id))
            return; // Sound already in project

        _sounds.Add(sound);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a sound from this project.
    /// </summary>
    /// <param name="sound">The sound to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when sound is null</exception>
    public void RemoveSound(Sound sound, DateTime updatedAt)
    {
        if (sound == null)
            throw new ArgumentNullException(nameof(sound));

        if (_sounds.Remove(sound))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this project contains a sound with the specified ID.
    /// </summary>
    /// <param name="soundId">The sound ID to check</param>
    /// <returns>True if the sound is in this project</returns>
    public bool HasSound(int soundId)
    {
        return _sounds.Any(s => s.Id == soundId);
    }

    /// <summary>
    /// Gets all sounds in this project.
    /// </summary>
    /// <returns>Read-only list of sounds</returns>
    public IReadOnlyList<Sound> GetSounds()
    {
        return _sounds.AsReadOnly();
    }

    public void AddEnvironmentMap(EnvironmentMap environmentMap, DateTime updatedAt)
    {
        if (environmentMap == null)
            throw new ArgumentNullException(nameof(environmentMap));

        if (_environmentMaps.Any(em => em.Id == environmentMap.Id))
            return;

        _environmentMaps.Add(environmentMap);
        UpdatedAt = updatedAt;
    }

    public void RemoveEnvironmentMap(EnvironmentMap environmentMap, DateTime updatedAt)
    {
        if (environmentMap == null)
            throw new ArgumentNullException(nameof(environmentMap));

        if (_environmentMaps.Remove(environmentMap))
            UpdatedAt = updatedAt;
    }

    public bool HasEnvironmentMap(int environmentMapId)
    {
        return _environmentMaps.Any(em => em.Id == environmentMapId);
    }

    public IReadOnlyList<EnvironmentMap> GetEnvironmentMaps()
    {
        return _environmentMaps.AsReadOnly();
    }

    /// <summary>
    /// Gets the count of models in this project.
    /// </summary>
    public int ModelCount => _models.Count;

    /// <summary>
    /// Gets the count of texture sets in this project.
    /// </summary>
    public int TextureSetCount => _textureSets.Count;

    /// <summary>
    /// Gets the count of sprites in this project.
    /// </summary>
    public int SpriteCount => _sprites.Count;

    /// <summary>
    /// Gets the count of sounds in this project.
    /// </summary>
    public int SoundCount => _sounds.Count;

    public int EnvironmentMapCount => _environmentMaps.Count;

    /// <summary>
    /// Checks if the project is empty (contains no models, texture sets, sprites, or sounds).
    /// </summary>
    public bool IsEmpty => _models.Count == 0 && _textureSets.Count == 0 && _sprites.Count == 0 && _sounds.Count == 0 && _environmentMaps.Count == 0;

    /// <summary>
    /// Gets a human-readable description of the project.
    /// </summary>
    /// <returns>Description including name and content counts</returns>
    public string GetSummary()
    {
        return $"{Name} ({_models.Count} models, {_textureSets.Count} texture sets, {_sprites.Count} sprites, {_sounds.Count} sounds, {_environmentMaps.Count} environment maps)";
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Project name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Project name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateNotes(string? notes)
    {
        if (notes != null && notes.Length > 4000)
            throw new ArgumentException("Project notes cannot exceed 4000 characters.", nameof(notes));
    }
}
