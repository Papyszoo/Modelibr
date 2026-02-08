namespace Domain.Models;

/// <summary>
/// Represents a user-configurable sound category for organizing sounds.
/// Categories are fully customizable - users can add, remove, and rename them.
/// </summary>
public class SoundCategory : AggregateRoot
{
    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    /// <summary>
    /// Creates a new sound category with the specified name and optional description.
    /// </summary>
    /// <param name="name">The name of the category</param>
    /// <param name="description">Optional description of the category</param>
    /// <param name="createdAt">When the category was created</param>
    /// <returns>A new SoundCategory instance</returns>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public static SoundCategory Create(string name, string? description, DateTime createdAt)
    {
        ValidateName(name);

        if (description != null && description.Length > 500)
            throw new ArgumentException("Sound category description cannot exceed 500 characters.", nameof(description));

        return new SoundCategory
        {
            Name = name.Trim(),
            Description = description?.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the name and description of the category.
    /// </summary>
    /// <param name="name">The new name</param>
    /// <param name="description">The new description</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public void Update(string name, string? description, DateTime updatedAt)
    {
        ValidateName(name);

        if (description != null && description.Length > 500)
            throw new ArgumentException("Sound category description cannot exceed 500 characters.", nameof(description));

        Name = name.Trim();
        Description = description?.Trim();
        UpdatedAt = updatedAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Sound category name cannot be null or empty.", nameof(name));

        if (name.Length > 100)
            throw new ArgumentException("Sound category name cannot exceed 100 characters.", nameof(name));
    }
}
