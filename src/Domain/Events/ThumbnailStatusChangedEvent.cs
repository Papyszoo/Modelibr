using SharedKernel;
using Domain.ValueObjects;

namespace Domain.Events;

/// <summary>
/// Domain event raised when a thumbnail status changes.
/// Used to notify the frontend via SignalR instead of polling.
/// </summary>
public class ThumbnailStatusChangedEvent : DomainEvent
{
    /// <summary>
    /// The ID of the model that had its thumbnail status changed.
    /// </summary>
    public int ModelId { get; }
    
    /// <summary>
    /// The new thumbnail status.
    /// </summary>
    public ThumbnailStatus Status { get; }
    
    /// <summary>
    /// The thumbnail file URL if ready, null otherwise.
    /// </summary>
    public string? ThumbnailUrl { get; }
    
    /// <summary>
    /// Error message if the thumbnail failed, null otherwise.
    /// </summary>
    public string? ErrorMessage { get; }

    public ThumbnailStatusChangedEvent(int modelId, ThumbnailStatus status, string? thumbnailUrl = null, string? errorMessage = null)
    {
        ModelId = modelId;
        Status = status;
        ThumbnailUrl = thumbnailUrl;
        ErrorMessage = errorMessage;
    }
}