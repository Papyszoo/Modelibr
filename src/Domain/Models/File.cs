using Domain.ValueObjects;

namespace Domain.Models;

public class File
{
    private readonly List<Model> _models = new();

    public int Id { get; set; }
    public string OriginalFileName { get; private set; } = string.Empty;
    public string StoredFileName { get; private set; } = string.Empty;
    public string FilePath { get; private set; } = string.Empty;
    public string MimeType { get; private set; } = string.Empty;
    public FileType FileType { get; private set; } = FileType.Unknown;
    public long SizeBytes { get; private set; }
    public string Sha256Hash { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool Deleted { get; private set; } = false;
    
    // Navigation property for many-to-many relationship - EF Core requires this to be settable
    public ICollection<Model> Models 
    { 
        get => _models; 
        set 
        {
            _models.Clear();
            if (value != null)
                _models.AddRange(value);
        }
    }

    public static File Create(
        string originalFileName,
        string storedFileName,
        string filePath,
        string mimeType,
        FileType fileType,
        long sizeBytes,
        string sha256Hash,
        DateTime createdAt)
    {
        ValidateFileName(originalFileName, nameof(originalFileName));
        ValidateFileName(storedFileName, nameof(storedFileName));
        ValidateFilePath(filePath);
        ValidateMimeType(mimeType);
        ValidateFileType(fileType);
        ValidateSizeBytes(sizeBytes);
        ValidateHash(sha256Hash);

        return new File
        {
            OriginalFileName = originalFileName.Trim(),
            StoredFileName = storedFileName.Trim(),
            FilePath = filePath.Trim(),
            MimeType = mimeType.Trim(),
            FileType = fileType,
            SizeBytes = sizeBytes,
            Sha256Hash = sha256Hash.ToLowerInvariant(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt,
            Deleted = false
        };
    }

    public void UpdateSize(long sizeBytes, DateTime updatedAt)
    {
        ValidateSizeBytes(sizeBytes);
        SizeBytes = sizeBytes;
        UpdatedAt = updatedAt;
    }

    public void MarkAsDeleted(DateTime updatedAt)
    {
        Deleted = true;
        UpdatedAt = updatedAt;
    }

    public void Restore(DateTime updatedAt)
    {
        Deleted = false;
        UpdatedAt = updatedAt;
    }

    public bool IsLinkedToModel(int modelId)
    {
        return _models.Any(m => m.Id == modelId);
    }

    private static void ValidateFileName(string fileName, string paramName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name cannot be null or empty.", paramName);
        
        if (fileName.Length > 255)
            throw new ArgumentException("File name cannot exceed 255 characters.", paramName);
    }

    private static void ValidateFilePath(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
            throw new ArgumentException("File path cannot be null or empty.", nameof(filePath));
        
        if (filePath.Length > 500)
            throw new ArgumentException("File path cannot exceed 500 characters.", nameof(filePath));
    }

    private static void ValidateMimeType(string mimeType)
    {
        if (string.IsNullOrWhiteSpace(mimeType))
            throw new ArgumentException("MIME type cannot be null or empty.", nameof(mimeType));
        
        if (mimeType.Length > 100)
            throw new ArgumentException("MIME type cannot exceed 100 characters.", nameof(mimeType));
    }

    private static void ValidateFileType(FileType? fileType)
    {
        if (fileType is null)
            throw new ArgumentNullException(nameof(fileType), "File type cannot be null.");
    }

    private static void ValidateSizeBytes(long sizeBytes)
    {
        if (sizeBytes < 0)
            throw new ArgumentException("File size cannot be negative.", nameof(sizeBytes));
        
        // 1GB limit
        if (sizeBytes > 1_073_741_824)
            throw new ArgumentException("File size cannot exceed 1GB.", nameof(sizeBytes));
    }

    private static void ValidateHash(string sha256Hash)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            throw new ArgumentException("SHA256 hash cannot be null or empty.", nameof(sha256Hash));
        
        if (sha256Hash.Length != 64)
            throw new ArgumentException("SHA256 hash must be exactly 64 characters long.", nameof(sha256Hash));
        
        if (!System.Text.RegularExpressions.Regex.IsMatch(sha256Hash, "^[a-fA-F0-9]+$"))
            throw new ArgumentException("SHA256 hash must contain only hexadecimal characters.", nameof(sha256Hash));
    }
}