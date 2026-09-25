namespace Domain.Models;

/// <summary>A first-class production character owned by a project.</summary>
public class ProjectCharacter : AggregateRoot
{
    private readonly List<ProjectCharacterImage> _images = new();
    private readonly List<ProjectCharacterModel> _models = new();
    private readonly List<CharacterAbility> _abilities = new();
    private readonly List<CharacterVariant> _variants = new();
    private readonly List<ProjectCharacterTag> _tags = new();

    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public Project Project { get; private set; } = null!;

    public ICollection<ProjectCharacterImage> Images
    {
        get => _images;
        set
        {
            _images.Clear();
            if (value != null)
                _images.AddRange(value);
        }
    }

    public ICollection<ProjectCharacterModel> Models
    {
        get => _models;
        set
        {
            _models.Clear();
            if (value != null)
                _models.AddRange(value);
        }
    }

    public ICollection<CharacterAbility> Abilities
    {
        get => _abilities;
        set
        {
            _abilities.Clear();
            if (value != null)
                _abilities.AddRange(value);
        }
    }

    public ICollection<CharacterVariant> Variants
    {
        get => _variants;
        set
        {
            _variants.Clear();
            if (value != null)
                _variants.AddRange(value);
        }
    }

    public ICollection<ProjectCharacterTag> Tags
    {
        get => _tags;
        set
        {
            _tags.Clear();
            if (value != null)
                _tags.AddRange(value);
        }
    }

    public ICollection<ProductionNote> Notes { get; } = new List<ProductionNote>();

    public bool IsEnemy => Tags.Any(tag =>
        string.Equals(tag.NormalizedName, "enemy", StringComparison.Ordinal));

    public static ProjectCharacter Create(
        int projectId,
        string name,
        string? description,
        DateTime now,
        IEnumerable<ProjectCharacterTag>? tags = null)
    {
        ValidateProjectId(projectId);

        var character = new ProjectCharacter
        {
            ProjectId = projectId,
            CreatedAt = now,
            UpdatedAt = now
        };
        character.Update(name, description, tags, now);
        return character;
    }

    public void Update(
        string name,
        string? description,
        IEnumerable<ProjectCharacterTag>? tags,
        DateTime updatedAt)
    {
        ValidateName(name);
        ValidateDescription(description);
        ValidateTags(tags);

        Name = name.Trim();
        Description = description?.Trim();
        _tags.Clear();
        if (tags != null)
        {
            foreach (var tag in tags.GroupBy(tag => tag.NormalizedName).Select(group => group.First()))
            {
                _tags.Add(tag);
            }
        }

        UpdatedAt = updatedAt;
    }

    public void Touch(DateTime updatedAt)
    {
        UpdatedAt = updatedAt;
    }

    public ProjectCharacterImage AddImage(
        File file,
        string? title,
        string? caption,
        int sortOrder,
        DateTime createdAt)
    {
        if (file is null)
            throw new ArgumentNullException(nameof(file));

        if (_images.Any(image => image.FileId == file.Id))
            throw new ArgumentException("That file is already linked to this character.", nameof(file));

        var image = ProjectCharacterImage.Create(ProjectId, Id, file, title, caption, sortOrder, createdAt);
        _images.Add(image);
        UpdatedAt = createdAt;
        return image;
    }

    public bool RemoveImage(int imageId)
    {
        var image = _images.FirstOrDefault(candidate => candidate.Id == imageId);
        if (image is null)
            return false;

        _images.Remove(image);
        return true;
    }

    public ProjectCharacterModel AddModel(
        Model model,
        string? label,
        int sortOrder,
        DateTime createdAt)
    {
        if (model is null)
            throw new ArgumentNullException(nameof(model));

        if (_models.Any(link => link.ModelId == model.Id))
            throw new ArgumentException("That model is already linked to this character.", nameof(model));

        var link = ProjectCharacterModel.Create(ProjectId, Id, model, label, sortOrder, createdAt);
        _models.Add(link);
        UpdatedAt = createdAt;
        return link;
    }

    public bool RemoveModel(int linkId)
    {
        var link = _models.FirstOrDefault(candidate => candidate.Id == linkId);
        if (link is null)
            return false;

        _models.Remove(link);
        return true;
    }

    public CharacterAbility AddAbility(
        string name,
        string? description,
        int sortOrder,
        DateTime createdAt)
    {
        var ability = CharacterAbility.Create(ProjectId, Id, name, description, sortOrder, createdAt);
        _abilities.Add(ability);
        UpdatedAt = createdAt;
        return ability;
    }

    public bool RemoveAbility(int abilityId)
    {
        var ability = _abilities.FirstOrDefault(candidate => candidate.Id == abilityId);
        if (ability is null)
            return false;

        _abilities.Remove(ability);
        return true;
    }

    public CharacterVariant AddVariant(
        string name,
        string? description,
        int? projectLevelId,
        int sortOrder,
        DateTime createdAt)
    {
        var variant = CharacterVariant.Create(ProjectId, Id, name, description, projectLevelId, sortOrder, createdAt);
        _variants.Add(variant);
        UpdatedAt = createdAt;
        return variant;
    }

    public bool RemoveVariant(int variantId)
    {
        var variant = _variants.FirstOrDefault(candidate => candidate.Id == variantId);
        if (variant is null)
            return false;

        _variants.Remove(variant);
        return true;
    }

    private static void ValidateProjectId(int projectId)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Character name is required.", nameof(name));
        if (name.Trim().Length > 200)
            throw new ArgumentException("Character name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateDescription(string? description)
    {
        if (description?.Trim().Length > 2000)
            throw new ArgumentException("Character description cannot exceed 2000 characters.", nameof(description));
    }

    private void ValidateTags(IEnumerable<ProjectCharacterTag>? tags)
    {
        if (tags is null)
            return;

        foreach (var tag in tags)
        {
            if (tag.ProjectId != ProjectId)
                throw new ArgumentException("Character tags must belong to the same project as the character.", nameof(tags));
        }
    }
}
