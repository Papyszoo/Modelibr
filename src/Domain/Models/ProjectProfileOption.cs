using Domain.Projects;

namespace Domain.Models;

/// <summary>
/// One value in a project-profile vocabulary - <c>Unity</c>, <c>Meta Quest</c>,
/// <c>Low Poly</c> - scoped to its <see cref="Dimension"/>.
///
/// <para>
/// A table rather than a C# enum because the user has to be able to add
/// <c>Vampire-Survivors-like</c> without waiting for a release. Not the tag system and not
/// <c>IHierarchicalCategory</c>: tag vocabularies are strictly per asset type and a project
/// is not an asset type, and categories are single-assignment trees while these are flat and
/// mostly multi-valued.
/// </para>
/// </summary>
public class ProjectProfileOption : AggregateRoot
{
    public int Id { get; private set; }

    /// <summary>One of <see cref="ProjectProfileDimensions"/>.</summary>
    public string Dimension { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    /// <summary>Lower-cased name; the uniqueness key within a dimension.</summary>
    public string NormalizedName { get; private set; } = string.Empty;

    /// <summary>
    /// Seeded by the migration. A built-in cannot be deleted, only hidden - deleting one
    /// would silently unassign it from every project that had chosen it.
    /// </summary>
    public bool IsBuiltIn { get; private set; }

    /// <summary>Hidden options stay assignable where already assigned but are not offered.</summary>
    public bool IsHidden { get; private set; }

    public int SortOrder { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public static ProjectProfileOption Create(
        string dimension, string name, DateTime createdAt, bool isBuiltIn = false, int sortOrder = 0)
    {
        var normalizedDimension = ProjectProfileDimensions.Normalize(dimension)
            ?? throw new ArgumentException(
                $"'{dimension}' is not a project profile dimension.", nameof(dimension));

        var trimmed = NormalizeName(name);

        return new ProjectProfileOption
        {
            Dimension = normalizedDimension,
            Name = trimmed,
            NormalizedName = trimmed.ToLowerInvariant(),
            IsBuiltIn = isBuiltIn,
            SortOrder = sortOrder,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void Rename(string name, DateTime updatedAt)
    {
        if (IsBuiltIn)
        {
            throw new InvalidOperationException("A built-in profile option cannot be renamed.");
        }

        var trimmed = NormalizeName(name);
        Name = trimmed;
        NormalizedName = trimmed.ToLowerInvariant();
        UpdatedAt = updatedAt;
    }

    public void SetHidden(bool hidden, DateTime updatedAt)
    {
        IsHidden = hidden;
        UpdatedAt = updatedAt;
    }

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Profile option name cannot be null or empty.", nameof(name));

        var trimmed = name.Trim();
        if (trimmed.Length > 100)
            throw new ArgumentException("Profile option name cannot exceed 100 characters.", nameof(name));

        return trimmed;
    }
}
