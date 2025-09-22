namespace Domain.ValueObjects;

/// <summary>
/// Represents the status of thumbnail generation for a file.
/// </summary>
public enum ThumbnailStatus
{
    /// <summary>
    /// Thumbnail generation is pending - waiting to be processed.
    /// </summary>
    Pending = 0,
    
    /// <summary>
    /// Thumbnail is currently being processed/generated.
    /// </summary>
    Processing = 1,
    
    /// <summary>
    /// Thumbnail has been successfully generated and is ready for use.
    /// </summary>
    Ready = 2,
    
    /// <summary>
    /// Thumbnail generation failed due to an error.
    /// </summary>
    Failed = 3
}