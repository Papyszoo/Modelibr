namespace Domain.Models;

/// <summary>
/// Represents a project/folder that groups models and texture sets together.
/// Provides organization and categorization for 3D assets.
/// </summary>
public class Project : AggregateRoot
{
    private readonly List<Model> _models = new();
    private readonly List<TextureSet> _textureSets = new();

    public int Id { get; set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

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
        ValidateName(name);

        if (description != null && description.Length > 1000)
            throw new ArgumentException("Project description cannot exceed 1000 characters.", nameof(description));

        return new Project
        {
            Name = name.Trim(),
            Description = description?.Trim(),
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
        ValidateName(name);

        if (description != null && description.Length > 1000)
            throw new ArgumentException("Project description cannot exceed 1000 characters.", nameof(description));

        Name = name.Trim();
        Description = description?.Trim();
        UpdatedAt = updatedAt;
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
    /// Gets the count of models in this project.
    /// </summary>
    public int ModelCount => _models.Count;

    /// <summary>
    /// Gets the count of texture sets in this project.
    /// </summary>
    public int TextureSetCount => _textureSets.Count;

    /// <summary>
    /// Checks if the project is empty (contains no models or texture sets).
    /// </summary>
    public bool IsEmpty => _models.Count == 0 && _textureSets.Count == 0;

    /// <summary>
    /// Gets a human-readable description of the project.
    /// </summary>
    /// <returns>Description including name and content counts</returns>
    public string GetSummary()
    {
        return $"{Name} ({_models.Count} models, {_textureSets.Count} texture sets)";
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Project name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Project name cannot exceed 200 characters.", nameof(name));
    }
}
