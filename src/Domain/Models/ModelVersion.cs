namespace Domain.Models;

public class ModelVersion
{
    private readonly List<File> _files = new();
    private readonly List<ModelVersionTextureSet> _textureMappings = new();

    public int Id { get; private set; }
    public int ModelId { get; private set; }
    public int VersionNumber { get; private set; }
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    public int? DefaultTextureSetId { get; private set; }
    public int? ThumbnailId { get; private set; }
    
    /// <summary>
    /// Material names extracted from the 3D model file (e.g. from GLB/GLTF materials).
    /// </summary>
    public List<string> MaterialNames { get; private set; } = new();
    
    /// <summary>
    /// Persisted variant (preset) names for this model version.
    /// Stored independently of texture mappings so empty presets survive.
    /// </summary>
    public List<string> VariantNames { get; private set; } = new();
    
    /// <summary>
    /// The name of the main (default) variant for this model version.
    /// When empty/null, the first variant or "" variant is considered main.
    /// </summary>
    public string? MainVariantName { get; private set; }
    
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

    /// <summary>
    /// Explicit join entities linking this version's material slots to texture sets.
    /// </summary>
    public ICollection<ModelVersionTextureSet> TextureMappings 
    { 
        get => _textureMappings; 
        set 
        {
            _textureMappings.Clear();
            if (value != null)
                _textureMappings.AddRange(value);
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
    /// Sets the material names extracted from the 3D model file.
    /// </summary>
    public void SetMaterialNames(List<string> materialNames, DateTime updatedAt)
    {
        MaterialNames = materialNames ?? new List<string>();
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Adds a texture mapping for a specific material slot within a variant.
    /// </summary>
    /// <param name="textureSetId">The texture set to assign</param>
    /// <param name="materialName">The material name (empty string for default/all)</param>
    /// <param name="updatedAt">When the mapping was made</param>
    /// <param name="variantName">The variant name (empty string for default variant)</param>
    public void AddTextureMapping(int textureSetId, string materialName, DateTime updatedAt, string variantName = "")
    {
        materialName ??= string.Empty;
        variantName ??= string.Empty;

        // Check if this exact mapping already exists
        if (_textureMappings.Any(m => m.TextureSetId == textureSetId && m.MaterialName == materialName && m.VariantName == variantName))
            return;

        // For named materials within the same variant, enforce one texture set per material per variant
        if (!string.IsNullOrEmpty(materialName))
        {
            var existing = _textureMappings.FirstOrDefault(m => m.MaterialName == materialName && m.VariantName == variantName);
            if (existing != null)
            {
                _textureMappings.Remove(existing);
            }
        }

        _textureMappings.Add(ModelVersionTextureSet.Create(Id, textureSetId, materialName, variantName));
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a texture mapping by material name within a specific variant.
    /// </summary>
    public void RemoveTextureMappingByMaterial(string materialName, DateTime updatedAt, string variantName = "")
    {
        materialName ??= string.Empty;
        variantName ??= string.Empty;
        var mapping = _textureMappings.FirstOrDefault(m => m.MaterialName == materialName && m.VariantName == variantName);
        if (mapping != null)
        {
            _textureMappings.Remove(mapping);
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Removes all texture mappings for a specific texture set (across all variants).
    /// </summary>
    public void RemoveTextureMappingsByTextureSetId(int textureSetId, DateTime updatedAt)
    {
        var toRemove = _textureMappings.Where(m => m.TextureSetId == textureSetId).ToList();
        foreach (var mapping in toRemove)
        {
            _textureMappings.Remove(mapping);
        }
        if (toRemove.Count > 0)
            UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes all texture mappings for a specific variant.
    /// </summary>
    public void RemoveTextureMappingsByVariant(string variantName, DateTime updatedAt)
    {
        variantName ??= string.Empty;
        var toRemove = _textureMappings.Where(m => m.VariantName == variantName).ToList();
        foreach (var mapping in toRemove)
        {
            _textureMappings.Remove(mapping);
        }
        if (toRemove.Count > 0)
            UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Checks if this model version has any texture mapping for the specified texture set.
    /// </summary>
    public bool HasTextureSet(int textureSetId)
    {
        return _textureMappings.Any(m => m.TextureSetId == textureSetId);
    }

    /// <summary>
    /// Gets all texture mappings for this model version.
    /// </summary>
    public IReadOnlyList<ModelVersionTextureSet> GetTextureMappings()
    {
        return _textureMappings.AsReadOnly();
    }

    /// <summary>
    /// Sets the default texture set for this model version.
    /// </summary>
    /// <param name="textureSetId">The ID of the texture set to set as default, or null to clear</param>
    /// <param name="updatedAt">When the default was set</param>
    /// <exception cref="InvalidOperationException">Thrown when the texture set is not associated with this model version</exception>
    public void SetDefaultTextureSet(int? textureSetId, DateTime updatedAt)
    {
        if (textureSetId.HasValue && !_textureMappings.Any(m => m.TextureSetId == textureSetId.Value))
        {
            throw new InvalidOperationException($"Texture set {textureSetId.Value} is not associated with this model version.");
        }

        DefaultTextureSetId = textureSetId;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Sets the main variant name for this model version.
    /// </summary>
    public void SetMainVariant(string variantName, DateTime updatedAt)
    {
        variantName ??= string.Empty;
        if (!string.IsNullOrEmpty(variantName) && !VariantNames.Contains(variantName))
        {
            throw new InvalidOperationException($"Variant '{variantName}' does not exist on this model version.");
        }

        MainVariantName = variantName;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Gets all distinct variant names in this model version.
    /// Returns the persisted VariantNames list.
    /// </summary>
    public IReadOnlyList<string> GetVariantNames()
    {
        return VariantNames.Distinct().OrderBy(v => v).ToList().AsReadOnly();
    }

    /// <summary>
    /// Adds a variant name to the persisted list.
    /// </summary>
    public void AddVariantName(string variantName, DateTime updatedAt)
    {
        variantName ??= string.Empty;
        if (string.IsNullOrEmpty(variantName)) return;
        if (VariantNames.Contains(variantName)) return;
        VariantNames.Add(variantName);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a variant name and all its texture mappings.
    /// </summary>
    public void RemoveVariantName(string variantName, DateTime updatedAt)
    {
        variantName ??= string.Empty;
        if (string.IsNullOrEmpty(variantName)) return;
        VariantNames.Remove(variantName);
        RemoveTextureMappingsByVariant(variantName, updatedAt);
        if (MainVariantName == variantName)
        {
            MainVariantName = null;
        }
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
