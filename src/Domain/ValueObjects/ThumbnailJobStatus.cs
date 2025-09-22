namespace Domain.ValueObjects;

/// <summary>
/// Represents the status of a thumbnail job in the queue.
/// </summary>
public enum ThumbnailJobStatus
{
    /// <summary>
    /// Job is pending - waiting to be processed.
    /// </summary>
    Pending = 0,
    
    /// <summary>
    /// Job is currently being processed by a worker.
    /// </summary>
    Processing = 1,
    
    /// <summary>
    /// Job has been completed successfully.
    /// </summary>
    Done = 2,
    
    /// <summary>
    /// Job has failed too many times and moved to dead letter queue.
    /// </summary>
    Dead = 3
}