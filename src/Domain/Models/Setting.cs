namespace Domain.Models;

/// <summary>
/// Represents a single application setting with a key-value pair.
/// </summary>
public class Setting : AggregateRoot
{
    public int Id { get; set; }
    public string Key { get; private set; } = string.Empty;
    public string Value { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    private Setting() { }

    /// <summary>
    /// Creates a new setting with the specified key and value.
    /// </summary>
    public static Setting Create(string key, string value, DateTime createdAt, string? description = null)
    {
        ValidateKey(key);
        ValidateValue(value);

        return new Setting
        {
            Key = key,
            Value = value,
            Description = description,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the value of this setting.
    /// </summary>
    public void UpdateValue(string value, DateTime updatedAt)
    {
        ValidateValue(value);
        Value = value;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the description of this setting.
    /// </summary>
    public void UpdateDescription(string? description, DateTime updatedAt)
    {
        Description = description;
        UpdatedAt = updatedAt;
    }

    private static void ValidateKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Setting key cannot be null or empty.", nameof(key));

        if (key.Length > 100)
            throw new ArgumentException("Setting key cannot exceed 100 characters.", nameof(key));
    }

    private static void ValidateValue(string value)
    {
        if (value == null)
            throw new ArgumentNullException(nameof(value), "Setting value cannot be null.");

        if (value.Length > 1000)
            throw new ArgumentException("Setting value cannot exceed 1000 characters.", nameof(value));
    }
}
