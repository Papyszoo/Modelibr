using SharedKernel;

namespace Domain.Events;

/// <summary>
/// Domain event raised when the active version of a model changes.
/// Used to notify the frontend via SignalR to switch displayed thumbnails.
/// </summary>
public class ActiveVersionChangedEvent : DomainEvent
{
    /// <summary>
    /// The ID of the model whose active version changed.
    /// </summary>
    public int ModelId { get; }
    
    /// <summary>
    /// The ID of the new active version.
    /// </summary>
    public int NewActiveVersionId { get; }
    
    /// <summary>
    /// The ID of the previous active version (if any).
    /// </summary>
    public int? PreviousActiveVersionId { get; }
    
    /// <summary>
    /// Whether the new active version has a ready thumbnail.
    /// </summary>
    public bool HasThumbnail { get; }
    
    /// <summary>
    /// The thumbnail URL if the new version has one, null otherwise.
    /// </summary>
    public string? ThumbnailUrl { get; }

    public ActiveVersionChangedEvent(
        int modelId, 
        int newActiveVersionId, 
        int? previousActiveVersionId, 
        bool hasThumbnail, 
        string? thumbnailUrl = null)
    {
        ModelId = modelId;
        NewActiveVersionId = newActiveVersionId;
        PreviousActiveVersionId = previousActiveVersionId;
        HasThumbnail = hasThumbnail;
        ThumbnailUrl = thumbnailUrl;
    }
}
