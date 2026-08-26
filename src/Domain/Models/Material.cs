using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// A reusable PBR material defined entirely by parameters - a colour, a roughness,
/// a metalness - with no image maps of any kind.
///
/// Why this is a separate aggregate from <see cref="TextureSet"/>: a texture set is
/// a collection of image channels and needs UVs to mean anything. A material is
/// numbers and needs nothing. They are browsed together (both attach to a model's
/// material slot, and a user shopping for "oak" should not have to know which
/// mechanism supplies it) but they are not the same entity, and the empty channel
/// collection a merged entity would carry is exactly the confusion worth avoiding.
///
/// The library this was built for has 1762 models and zero texture sets - the CC0
/// kit assets ship as flat grey with no images at all. A scalar material is the only
/// thing that can dress them.
/// </summary>
public class Material : AggregateRoot
{
    private readonly List<ModelTag> _tags = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }

    /// <summary>
    /// Shared with Universal texture sets on purpose: the two are one browsable
    /// category, so they share one category vocabulary. Only categories whose
    /// <see cref="TextureSetCategory.Kind"/> is Universal are valid here.
    /// </summary>
    public int? CategoryId { get; private set; }

    public MaterialParameters Parameters { get; private set; } = MaterialParameters.Default;

    /// <summary>
    /// Geometry the preview thumbnail is rendered on ("sphere", "box", "cylinder",
    /// "torus", "plane"). Matches TextureSet's field so one generator serves both.
    /// A parameters-only material still needs a thumbnail - it is how you shop for it.
    /// </summary>
    public string PreviewGeometryType { get; private set; } = "sphere";

    public string? ThumbnailPath { get; private set; }
    public string? PngThumbnailPath { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    public TextureSetCategory? Category { get; private set; }

    /// <summary>
    /// Shared <see cref="ModelTag"/> pool, the same one models, environment maps and
    /// texture sets draw from. Categories are per asset type here; tags are not.
    /// </summary>
    public ICollection<ModelTag> Tags
    {
        get => _tags;
        set
        {
            _tags.Clear();
            if (value != null)
                _tags.AddRange(value);
        }
    }

    // Deliberately not a pack or project member yet. Packs carry licence at pack
    // level, so a CC0 material pack needs Pack.Materials before it can exist - but
    // there are no material packs to import until the store side (prompts 07/08)
    // grows a Materials pack type, and adding the collection now would be six DTOs
    // and a frontend for content nobody has.

    /// <summary>
    /// A material never needs UVs. This is the discriminator the merged browse
    /// surface and search hits carry, so an agent can avoid putting a tiling
    /// texture on an asset whose UVs are bad - or missing.
    /// </summary>
    public bool RequiresUvs => false;

    public static Material Create(
        string name,
        MaterialParameters parameters,
        DateTime createdAt,
        string? description = null,
        int? categoryId = null,
        string? previewGeometryType = null)
    {
        ValidateName(name);
        ValidateDescription(description);
        ArgumentNullException.ThrowIfNull(parameters);

        return new Material
        {
            Name = name.Trim(),
            Description = description?.Trim(),
            Parameters = parameters,
            CategoryId = categoryId,
            PreviewGeometryType = NormalizePreviewGeometry(previewGeometryType),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void UpdateName(string name, DateTime updatedAt)
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

    public void UpdateParameters(MaterialParameters parameters, DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(parameters);

        Parameters = parameters;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Replaces the tag set wholesale. Tags arrive already resolved against the
    /// shared pool, as they do for models and texture sets.
    /// </summary>
    public void SetTags(IEnumerable<ModelTag> tags, DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(tags);

        _tags.Clear();
        foreach (var tag in tags.Where(tag => tag is not null).DistinctBy(tag => tag.NormalizedName))
            _tags.Add(tag);

        UpdatedAt = updatedAt;
    }

    public void UpdateCategory(int? categoryId, DateTime updatedAt)
    {
        CategoryId = categoryId;
        UpdatedAt = updatedAt;
    }

    public void UpdatePreviewGeometryType(string? previewGeometryType, DateTime updatedAt)
    {
        PreviewGeometryType = NormalizePreviewGeometry(previewGeometryType);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Records a rendered preview. Clearing both paths is how a re-render is queued.
    /// </summary>
    public void SetThumbnailPaths(string? thumbnailPath, string? pngThumbnailPath, DateTime updatedAt)
    {
        ThumbnailPath = string.IsNullOrWhiteSpace(thumbnailPath) ? null : thumbnailPath.Trim();
        PngThumbnailPath = string.IsNullOrWhiteSpace(pngThumbnailPath) ? null : pngThumbnailPath.Trim();
        UpdatedAt = updatedAt;
    }

    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;
    }

    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;
    }

    private static string NormalizePreviewGeometry(string? previewGeometryType)
    {
        if (string.IsNullOrWhiteSpace(previewGeometryType))
            return "sphere";

        var normalized = previewGeometryType.Trim().ToLowerInvariant();

        return normalized switch
        {
            "sphere" or "box" or "cylinder" or "torus" or "plane" => normalized,
            _ => throw new ArgumentException(
                $"Unknown preview geometry '{previewGeometryType}'. Expected sphere, box, cylinder, torus or plane.",
                nameof(previewGeometryType))
        };
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Material name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Material name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateDescription(string? description)
    {
        if (description != null && description.Length > 1000)
            throw new ArgumentException("Material description cannot exceed 1000 characters.", nameof(description));
    }
}
