namespace Domain.Models;

public class RecycledFile
{
    public int Id { get; set; }
    public string OriginalFileName { get; private set; } = string.Empty;
    public string StoredFileName { get; private set; } = string.Empty;
    public string FilePath { get; private set; } = string.Empty;
    public string Sha256Hash { get; private set; } = string.Empty;
    public long SizeBytes { get; private set; }
    public string Reason { get; private set; } = string.Empty;
    public DateTime RecycledAt { get; private set; }
    public DateTime? ScheduledDeletionAt { get; private set; }

    private RecycledFile() { }

    public static RecycledFile Create(
        string originalFileName,
        string storedFileName,
        string filePath,
        string sha256Hash,
        long sizeBytes,
        string reason,
        DateTime recycledAt,
        DateTime? scheduledDeletionAt = null)
    {
        ValidateFileName(originalFileName, nameof(originalFileName));
        ValidateFileName(storedFileName, nameof(storedFileName));
        ValidateFilePath(filePath);
        ValidateHash(sha256Hash);
        ValidateSizeBytes(sizeBytes);
        ValidateReason(reason);

        return new RecycledFile
        {
            OriginalFileName = originalFileName.Trim(),
            StoredFileName = storedFileName.Trim(),
            FilePath = filePath.Trim(),
            Sha256Hash = sha256Hash.ToLowerInvariant(),
            SizeBytes = sizeBytes,
            Reason = reason.Trim(),
            RecycledAt = recycledAt,
            ScheduledDeletionAt = scheduledDeletionAt
        };
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

    private static void ValidateHash(string sha256Hash)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            throw new ArgumentException("SHA256 hash cannot be null or empty.", nameof(sha256Hash));
        
        if (sha256Hash.Length != 64)
            throw new ArgumentException("SHA256 hash must be exactly 64 characters long.", nameof(sha256Hash));
        
        if (!System.Text.RegularExpressions.Regex.IsMatch(sha256Hash, "^[a-fA-F0-9]+$"))
            throw new ArgumentException("SHA256 hash must contain only hexadecimal characters.", nameof(sha256Hash));
    }

    private static void ValidateSizeBytes(long sizeBytes)
    {
        if (sizeBytes < 0)
            throw new ArgumentException("File size cannot be negative.", nameof(sizeBytes));
    }

    private static void ValidateReason(string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
            throw new ArgumentException("Reason cannot be null or empty.", nameof(reason));
        
        if (reason.Length > 500)
            throw new ArgumentException("Reason cannot exceed 500 characters.", nameof(reason));
    }
}
