namespace Domain.Files;

public class StoredFile
{
    public Guid Id { get; set; }
    public FileType FileType { get; set; }
    public string StoredRelativePath { get; set; } = null!;     // e.g. ab/cd/<hash>
    public string StoredName { get; set; } = null!;             // full hash (no ext)
    public string OriginalName { get; set; } = null!;
    public string OriginalExtension { get; set; } = null!;
    public string MimeType { get; set; } = null!;
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = null!;
    public DateTime CreatedUtc { get; set; }
}