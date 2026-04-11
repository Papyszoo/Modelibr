namespace Domain.Models;

public class SpriteCategory : AggregateRoot
{
    private readonly List<SpriteCategory> _children = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public int? ParentId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public SpriteCategory? Parent { get; private set; }
    public ICollection<SpriteCategory> Children
    {
        get => _children;
        set
        {
            _children.Clear();
            if (value != null)
                _children.AddRange(value);
        }
    }

    public static SpriteCategory Create(string name, string? description, int? parentId, DateTime createdAt)
    {
        ValidateName(name);
        ValidateDescription(description);

        return new SpriteCategory
        {
            Name = name.Trim(),
            Description = description?.Trim(),
            ParentId = parentId,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void Update(string name, string? description, DateTime updatedAt)
    {
        ValidateName(name);
        ValidateDescription(description);

        Name = name.Trim();
        Description = description?.Trim();
        UpdatedAt = updatedAt;
    }

    public void MoveTo(int? parentId, DateTime updatedAt)
    {
        if (parentId.HasValue && parentId.Value == Id)
            throw new ArgumentException("A category cannot be its own parent.", nameof(parentId));

        ParentId = parentId;
        UpdatedAt = updatedAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Sprite category name cannot be null or empty.", nameof(name));

        if (name.Length > 100)
            throw new ArgumentException("Sprite category name cannot exceed 100 characters.", nameof(name));
    }

    private static void ValidateDescription(string? description)
    {
        if (description != null && description.Length > 500)
            throw new ArgumentException("Sprite category description cannot exceed 500 characters.", nameof(description));
    }
}
