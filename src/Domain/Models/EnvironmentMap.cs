using Domain.Events;
using Domain.ValueObjects;

namespace Domain.Models;

public class EnvironmentMap : AggregateRoot
{
    private readonly List<EnvironmentMapVariant> _variants = new();
    private readonly List<Pack> _packs = new();
    private readonly List<Project> _projects = new();
    private readonly List<ModelTag> _tags = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public int? PreviewVariantId { get; private set; }
    public int? CustomThumbnailFileId { get; private set; }
    public int? EnvironmentMapCategoryId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    public File? CustomThumbnailFile { get; private set; }
    public EnvironmentMapCategory? EnvironmentMapCategory { get; private set; }

    public ICollection<EnvironmentMapVariant> Variants
    {
        get => _variants;
        set
        {
            _variants.Clear();
            if (value != null)
                _variants.AddRange(value);
        }
    }

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

    public static EnvironmentMap Create(string name, DateTime createdAt)
    {
        ValidateName(name);

        var environmentMap = new EnvironmentMap
        {
            Name = name.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };

        environmentMap.RaiseDomainEvent(new EnvironmentMapCreatedEvent(environmentMap.Id, environmentMap.Name));

        return environmentMap;
    }

    public void UpdateName(string name, DateTime updatedAt)
    {
        ValidateName(name);
        Name = name.Trim();
        UpdatedAt = updatedAt;
    }

    public void AddVariant(EnvironmentMapVariant variant, DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(variant);

        if (_variants.Any(v => !v.IsDeleted && v.SizeLabel.Equals(variant.SizeLabel, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"An environment map variant with size '{variant.SizeLabel}' already exists.");

        _variants.Add(variant);

        if (variant.Id > 0 && (!PreviewVariantId.HasValue || !_variants.Any(v => !v.IsDeleted && v.Id == PreviewVariantId.Value)))
            PreviewVariantId = variant.Id;

        UpdatedAt = updatedAt;
        EnsurePreviewVariant();
    }

    public void UpdateVariantSizeLabel(int variantId, string sizeLabel, DateTime updatedAt)
    {
        var variant = GetVariantOrThrow(variantId, includeDeleted: true);

        if (_variants.Any(v => v.Id != variantId && !v.IsDeleted && v.SizeLabel.Equals(sizeLabel, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"An environment map variant with size '{sizeLabel}' already exists.");

        variant.UpdateSizeLabel(sizeLabel, updatedAt);
        UpdatedAt = updatedAt;
    }

    public void SetPreviewVariant(int? variantId, DateTime updatedAt)
    {
        if (variantId.HasValue)
        {
            var variant = GetVariantOrThrow(variantId.Value, includeDeleted: false);
            PreviewVariantId = variant.Id;
        }
        else
        {
            PreviewVariantId = null;
            EnsurePreviewVariant();
        }

        UpdatedAt = updatedAt;
    }

    public void SetCustomThumbnail(File? file, DateTime updatedAt)
    {
        CustomThumbnailFileId = file?.Id;
        CustomThumbnailFile = file;
        UpdatedAt = updatedAt;
    }

    public void SoftDeleteVariant(int variantId, DateTime updatedAt)
    {
        var variant = GetVariantOrThrow(variantId, includeDeleted: false);

        if (_variants.Count(v => !v.IsDeleted) <= 1)
            throw new InvalidOperationException("An environment map must have at least one active variant.");

        variant.SoftDelete(updatedAt);
        UpdatedAt = updatedAt;
        EnsurePreviewVariant();
    }

    public void RestoreVariant(int variantId, DateTime updatedAt)
    {
        var variant = GetVariantOrThrow(variantId, includeDeleted: true);
        variant.Restore(updatedAt);
        UpdatedAt = updatedAt;
        EnsurePreviewVariant();
    }

    public void HardRemoveVariant(int variantId, DateTime updatedAt)
    {
        var variant = GetVariantOrThrow(variantId, includeDeleted: true);

        if (!variant.IsDeleted && _variants.Count(v => !v.IsDeleted) <= 1)
            throw new InvalidOperationException("An environment map must have at least one active variant.");

        _variants.Remove(variant);
        UpdatedAt = updatedAt;
        EnsurePreviewVariant();
    }

    public EnvironmentMapVariant? GetVariant(int variantId, bool includeDeleted = false)
    {
        return _variants.FirstOrDefault(v => v.Id == variantId && (includeDeleted || !v.IsDeleted));
    }

    public EnvironmentMapVariant? GetPreviewVariant()
    {
        EnsurePreviewVariant();
        return PreviewVariantId.HasValue
            ? _variants.FirstOrDefault(v => !v.IsDeleted && v.Id == PreviewVariantId.Value)
            : null;
    }

    public void AddPack(Pack pack, DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(pack);
        if (_packs.Any(p => p.Id == pack.Id))
            return;

        _packs.Add(pack);
        UpdatedAt = updatedAt;
    }

    public void RemovePack(Pack pack, DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(pack);
        if (_packs.Remove(pack))
            UpdatedAt = updatedAt;
    }

    public void AddProject(Project project, DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(project);
        if (_projects.Any(p => p.Id == project.Id))
            return;

        _projects.Add(project);
        UpdatedAt = updatedAt;
    }

    public void RemoveProject(Project project, DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(project);
        if (_projects.Remove(project))
            UpdatedAt = updatedAt;
    }

    public void SetMetadata(IEnumerable<ModelTag> tags, DateTime updatedAt)
    {
        _tags.Clear();
        if (tags != null)
        {
            foreach (var tag in tags.GroupBy(tag => tag.NormalizedName).Select(group => group.First()))
                _tags.Add(tag);
        }

        UpdatedAt = updatedAt;
    }

    public void AssignCategory(int? categoryId, DateTime updatedAt)
    {
        EnvironmentMapCategoryId = categoryId;
        UpdatedAt = updatedAt;
    }

    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;

        foreach (var variant in _variants.Where(v => !v.IsDeleted))
            variant.SoftDelete(deletedAt);

        RaiseDomainEvent(new EnvironmentMapDeletedEvent(Id));
    }

    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;

        foreach (var variant in _variants.Where(v => v.IsDeleted))
            variant.Restore(restoredAt);

        EnsurePreviewVariant();
    }

    public int VariantCount => _variants.Count(v => !v.IsDeleted);
    public bool IsEmpty => VariantCount == 0;

    public void Touch(DateTime updatedAt)
    {
        UpdatedAt = updatedAt;
    }

    private void EnsurePreviewVariant()
    {
        var activeVariants = _variants.Where(v => !v.IsDeleted).ToList();
        if (activeVariants.Count == 0)
        {
            PreviewVariantId = null;
            return;
        }

        if (PreviewVariantId.HasValue && activeVariants.Any(v => v.Id == PreviewVariantId.Value))
            return;

        var candidateId = activeVariants
            .OrderByDescending(v => EnvironmentMapSizeLabel.GetSortScore(v.SizeLabel))
            .ThenBy(v => v.CreatedAt)
            .Select(v => v.Id)
            .FirstOrDefault();

        PreviewVariantId = candidateId > 0 ? candidateId : null;
    }

    private EnvironmentMapVariant GetVariantOrThrow(int variantId, bool includeDeleted)
    {
        return GetVariant(variantId, includeDeleted)
            ?? throw new InvalidOperationException($"Environment map variant with ID {variantId} was not found.");
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Environment map name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Environment map name cannot exceed 200 characters.", nameof(name));
    }
}
