namespace Domain.Models;

public class ModelVersion
{
    private readonly List<File> _files = new();
    private readonly List<TextureSet> _textureSets = new();

    public int Id { get; set; }
    public int ModelId { get; private set; }
    public int VersionNumber { get; private set; }
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    public int? DefaultTextureSetId { get; private set; }
    public int? ThumbnailId { get; private set; }
    
    // Navigation properties
    public Model Model { get; set; } = null!;
    public Thumbnail? Thumbnail { get; private set; }
    public ICollection<File> Files 
    { 
        get => _files; 
        set 
        {
            _files.Clear();
            if (value != null)
                _files.AddRange(value);
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

    public static ModelVersion Create(int modelId, int versionNumber, string? description, DateTime createdAt)
    {
        if (versionNumber < 1)
            throw new ArgumentException("Version number must be at least 1.", nameof(versionNumber));

        return new ModelVersion
        {
            ModelId = modelId,
            VersionNumber = versionNumber,
            Description = description?.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void UpdateDescription(string? description)
    {
        Description = description?.Trim();
    }

    public void AddFile(File file)
    {
        if (file == null)
            throw new ArgumentNullException(nameof(file));

        if (_files.Any(f => f.Sha256Hash == file.Sha256Hash))
            return; // File already exists in this version

        _files.Add(file);
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetThumbnail(Thumbnail thumbnail)
    {
        Thumbnail = thumbnail ?? throw new ArgumentNullException(nameof(thumbnail));
        ThumbnailId = thumbnail.Id;
        UpdatedAt = DateTime.UtcNow;
    }

    public bool HasFile(string sha256Hash)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            return false;

        return _files.Any(f => f.Sha256Hash == sha256Hash);
    }

    public IReadOnlyList<File> GetFiles()
    {
        return _files.AsReadOnly();
    }

    /// <summary>
    /// Associates a texture set with this model version.
    /// </summary>
    /// <param name="textureSet">The texture set to associate</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when textureSet is null</exception>
    public void AddTextureSet(TextureSet textureSet, DateTime updatedAt)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        if (_textureSets.Any(tp => tp.Id == textureSet.Id))
            return; // Texture set already associated

        _textureSets.Add(textureSet);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a texture set association from this model version.
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
    /// Checks if this model version has an associated texture set with the specified ID.
    /// </summary>
    /// <param name="textureSetId">The texture set ID to check</param>
    /// <returns>True if the texture set is associated with this model version</returns>
    public bool HasTextureSet(int textureSetId)
    {
        return _textureSets.Any(tp => tp.Id == textureSetId);
    }

    /// <summary>
    /// Gets all texture sets associated with this model version.
    /// </summary>
    /// <returns>Read-only list of associated texture sets</returns>
    public IReadOnlyList<TextureSet> GetTextureSets()
    {
        return _textureSets.AsReadOnly();
    }

    /// <summary>
    /// Sets the default texture set for this model version.
    /// </summary>
    /// <param name="textureSetId">The ID of the texture set to set as default, or null to clear</param>
    /// <param name="updatedAt">When the default was set</param>
    /// <exception cref="InvalidOperationException">Thrown when the texture set is not associated with this model version</exception>
    public void SetDefaultTextureSet(int? textureSetId, DateTime updatedAt)
    {
        if (textureSetId.HasValue && !_textureSets.Any(ts => ts.Id == textureSetId.Value))
        {
            throw new InvalidOperationException($"Texture set {textureSetId.Value} is not associated with this model version.");
        }

        DefaultTextureSetId = textureSetId;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Soft deletes this model version by marking it as deleted.
    /// </summary>
    /// <param name="deletedAt">When the version was deleted</param>
    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
    }

    /// <summary>
    /// Restores a soft-deleted model version.
    /// </summary>
    /// <param name="restoredAt">When the version was restored</param>
    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
    }
}
