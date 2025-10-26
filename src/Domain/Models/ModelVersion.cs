namespace Domain.Models;

public class ModelVersion
{
    private readonly List<File> _files = new();

    public int Id { get; set; }
    public int ModelId { get; private set; }
    public int VersionNumber { get; private set; }
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public int DisplayOrder { get; private set; }
    
    // Navigation properties
    public Model Model { get; set; } = null!;
    public Thumbnail? Thumbnail { get; set; }
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
            DisplayOrder = versionNumber // Initialize DisplayOrder to match VersionNumber
        };
    }

    public void UpdateDescription(string? description)
    {
        Description = description?.Trim();
    }

    public void UpdateDisplayOrder(int displayOrder)
    {
        if (displayOrder < 0)
            throw new ArgumentException("Display order cannot be negative.", nameof(displayOrder));
        
        DisplayOrder = displayOrder;
    }

    public void AddFile(File file)
    {
        if (file == null)
            throw new ArgumentNullException(nameof(file));

        if (_files.Any(f => f.Sha256Hash == file.Sha256Hash))
            return; // File already exists in this version

        _files.Add(file);
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
}
