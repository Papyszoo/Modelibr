namespace Domain.Models;

public class File
{
    public int Id { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public FileType FileType { get; set; } = FileType.Unknown;
    public long SizeBytes { get; set; }
    public string Sha256Hash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    
    // Navigation property for many-to-many relationship
    public ICollection<Model> Models { get; set; } = new List<Model>();
}