namespace Domain.Models;

public class EnvironmentMapVariant
{
    public int Id { get; private set; }
    public int EnvironmentMapId { get; internal set; }
    public int FileId { get; private set; }
    public string SizeLabel { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    public File File { get; private set; } = null!;

    public static EnvironmentMapVariant Create(File file, string sizeLabel, DateTime createdAt)
    {
        ArgumentNullException.ThrowIfNull(file);
        ValidateSizeLabel(sizeLabel);

        return new EnvironmentMapVariant
        {
            FileId = file.Id,
            File = file,
            SizeLabel = sizeLabel.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void UpdateSizeLabel(string sizeLabel, DateTime updatedAt)
    {
        ValidateSizeLabel(sizeLabel);

        SizeLabel = sizeLabel.Trim();
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

    private static void ValidateSizeLabel(string sizeLabel)
    {
        if (string.IsNullOrWhiteSpace(sizeLabel))
            throw new ArgumentException("Variant size label cannot be null or empty.", nameof(sizeLabel));

        if (sizeLabel.Length > 50)
            throw new ArgumentException("Variant size label cannot exceed 50 characters.", nameof(sizeLabel));
    }
}
