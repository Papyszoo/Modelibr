using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Represents a thumbnail generated for a file, with support for multiple formats and extensibility.
/// </summary>
public class Thumbnail
{
    public int Id { get; set; }
    
    /// <summary>
    /// The ID of the source file this thumbnail was generated from.
    /// </summary>
    public int FileId { get; private set; }
    
    /// <summary>
    /// The format/type of the thumbnail (e.g., "png", "webp", "gif", "poster").
    /// </summary>
    public string Format { get; private set; } = string.Empty;
    
    /// <summary>
    /// Current status of the thumbnail generation workflow.
    /// </summary>
    public ThumbnailStatus Status { get; private set; } = ThumbnailStatus.Pending;
    
    /// <summary>
    /// The file path where the generated thumbnail is stored (when Ready).
    /// </summary>
    public string? ThumbnailPath { get; private set; }
    
    /// <summary>
    /// Size of the generated thumbnail file in bytes (when Ready).
    /// </summary>
    public long? SizeBytes { get; private set; }
    
    /// <summary>
    /// Width of the thumbnail image in pixels (when Ready).
    /// </summary>
    public int? Width { get; private set; }
    
    /// <summary>
    /// Height of the thumbnail image in pixels (when Ready).
    /// </summary>
    public int? Height { get; private set; }
    
    /// <summary>
    /// Error message if thumbnail generation failed.
    /// </summary>
    public string? ErrorMessage { get; private set; }
    
    /// <summary>
    /// When the thumbnail generation was requested.
    /// </summary>
    public DateTime CreatedAt { get; private set; }
    
    /// <summary>
    /// When the thumbnail record was last updated.
    /// </summary>
    public DateTime UpdatedAt { get; private set; }
    
    /// <summary>
    /// When the thumbnail generation was completed (successfully or failed).
    /// </summary>
    public DateTime? ProcessedAt { get; private set; }
    
    // Navigation property
    public File File { get; set; } = null!;

    /// <summary>
    /// Creates a new thumbnail record for processing.
    /// </summary>
    public static Thumbnail Create(int fileId, string format, DateTime createdAt)
    {
        ValidateFileId(fileId);
        ValidateFormat(format);

        return new Thumbnail
        {
            FileId = fileId,
            Format = format.ToLowerInvariant().Trim(),
            Status = ThumbnailStatus.Pending,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Marks the thumbnail as being processed.
    /// </summary>
    public void MarkAsProcessing(DateTime updatedAt)
    {
        Status = ThumbnailStatus.Processing;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Marks the thumbnail as ready with the generated file details.
    /// </summary>
    public void MarkAsReady(string thumbnailPath, long sizeBytes, int width, int height, DateTime processedAt)
    {
        ValidateThumbnailPath(thumbnailPath);
        ValidateSizeBytes(sizeBytes);
        ValidateImageDimensions(width, height);

        Status = ThumbnailStatus.Ready;
        ThumbnailPath = thumbnailPath.Trim();
        SizeBytes = sizeBytes;
        Width = width;
        Height = height;
        ErrorMessage = null;
        ProcessedAt = processedAt;
        UpdatedAt = processedAt;
    }

    /// <summary>
    /// Marks the thumbnail generation as failed with an error message.
    /// </summary>
    public void MarkAsFailed(string errorMessage, DateTime processedAt)
    {
        ValidateErrorMessage(errorMessage);

        Status = ThumbnailStatus.Failed;
        ErrorMessage = errorMessage.Trim();
        ProcessedAt = processedAt;
        UpdatedAt = processedAt;
    }

    /// <summary>
    /// Resets the thumbnail for retry (back to Pending status).
    /// </summary>
    public void Reset(DateTime updatedAt)
    {
        Status = ThumbnailStatus.Pending;
        ErrorMessage = null;
        ProcessedAt = null;
        UpdatedAt = updatedAt;
    }

    private static void ValidateFileId(int fileId)
    {
        if (fileId <= 0)
            throw new ArgumentException("File ID must be greater than 0.", nameof(fileId));
    }

    private static void ValidateFormat(string format)
    {
        if (string.IsNullOrWhiteSpace(format))
            throw new ArgumentException("Format cannot be null or empty.", nameof(format));
        
        if (format.Length > 50)
            throw new ArgumentException("Format cannot exceed 50 characters.", nameof(format));
    }

    private static void ValidateThumbnailPath(string thumbnailPath)
    {
        if (string.IsNullOrWhiteSpace(thumbnailPath))
            throw new ArgumentException("Thumbnail path cannot be null or empty.", nameof(thumbnailPath));
        
        if (thumbnailPath.Length > 500)
            throw new ArgumentException("Thumbnail path cannot exceed 500 characters.", nameof(thumbnailPath));
    }

    private static void ValidateSizeBytes(long sizeBytes)
    {
        if (sizeBytes < 0)
            throw new ArgumentException("Size bytes cannot be negative.", nameof(sizeBytes));
    }

    private static void ValidateImageDimensions(int width, int height)
    {
        if (width <= 0)
            throw new ArgumentException("Width must be greater than 0.", nameof(width));
        
        if (height <= 0)
            throw new ArgumentException("Height must be greater than 0.", nameof(height));
    }

    private static void ValidateErrorMessage(string errorMessage)
    {
        if (string.IsNullOrWhiteSpace(errorMessage))
            throw new ArgumentException("Error message cannot be null or empty.", nameof(errorMessage));
        
        if (errorMessage.Length > 1000)
            throw new ArgumentException("Error message cannot exceed 1000 characters.", nameof(errorMessage));
    }
}