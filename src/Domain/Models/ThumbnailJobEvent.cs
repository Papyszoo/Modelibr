namespace Domain.Models;

/// <summary>
/// Represents a detailed event that occurred during thumbnail job processing.
/// This provides an audit trail of all steps in the thumbnail generation process.
/// </summary>
public class ThumbnailJobEvent
{
    public int Id { get; private set; }
    
    /// <summary>
    /// The ID of the thumbnail job this event belongs to.
    /// </summary>
    public int ThumbnailJobId { get; private set; }
    
    /// <summary>
    /// The type of event (e.g., "JobStarted", "ModelDownloaded", "FrameRendered", "EncodingCompleted", "JobFailed").
    /// </summary>
    public string EventType { get; private set; } = string.Empty;
    
    /// <summary>
    /// Detailed message about the event.
    /// </summary>
    public string Message { get; private set; } = string.Empty;
    
    /// <summary>
    /// Additional metadata as JSON (optional).
    /// </summary>
    public string? Metadata { get; private set; }
    
    /// <summary>
    /// Error message if this is an error event (optional).
    /// </summary>
    public string? ErrorMessage { get; private set; }
    
    /// <summary>
    /// When the event occurred.
    /// </summary>
    public DateTime OccurredAt { get; private set; }
    
    // Navigation property
    public ThumbnailJob ThumbnailJob { get; set; } = null!;

    /// <summary>
    /// Creates a new thumbnail job event.
    /// </summary>
    public static ThumbnailJobEvent Create(
        int thumbnailJobId, 
        string eventType, 
        string message, 
        DateTime occurredAt,
        string? metadata = null,
        string? errorMessage = null)
    {
        ValidateThumbnailJobId(thumbnailJobId);
        ValidateEventType(eventType);
        ValidateMessage(message);
        
        if (metadata != null)
        {
            ValidateMetadata(metadata);
        }
        
        if (errorMessage != null)
        {
            ValidateErrorMessage(errorMessage);
        }

        return new ThumbnailJobEvent
        {
            ThumbnailJobId = thumbnailJobId,
            EventType = eventType.Trim(),
            Message = message.Trim(),
            Metadata = metadata?.Trim(),
            ErrorMessage = errorMessage?.Trim(),
            OccurredAt = occurredAt
        };
    }

    private static void ValidateThumbnailJobId(int thumbnailJobId)
    {
        if (thumbnailJobId <= 0)
            throw new ArgumentException("Thumbnail job ID must be greater than 0.", nameof(thumbnailJobId));
    }

    private static void ValidateEventType(string eventType)
    {
        if (string.IsNullOrWhiteSpace(eventType))
            throw new ArgumentException("Event type cannot be null or empty.", nameof(eventType));
        
        if (eventType.Length > 100)
            throw new ArgumentException("Event type cannot exceed 100 characters.", nameof(eventType));
    }

    private static void ValidateMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            throw new ArgumentException("Message cannot be null or empty.", nameof(message));
        
        if (message.Length > 1000)
            throw new ArgumentException("Message cannot exceed 1000 characters.", nameof(message));
    }

    private static void ValidateMetadata(string metadata)
    {
        if (metadata.Length > 4000)
            throw new ArgumentException("Metadata cannot exceed 4000 characters.", nameof(metadata));
    }

    private static void ValidateErrorMessage(string errorMessage)
    {
        if (errorMessage.Length > 2000)
            throw new ArgumentException("Error message cannot exceed 2000 characters.", nameof(errorMessage));
    }
}
