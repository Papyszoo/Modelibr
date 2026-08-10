namespace Domain.ValueObjects;

/// <summary>
/// Status of an asset metadata extraction job in the queue.
/// Mirrors <see cref="ThumbnailJobStatus"/> — extraction is a separate,
/// decoupled job family from thumbnail rendering.
/// </summary>
public enum ExtractionJobStatus
{
    /// <summary>Waiting to be processed.</summary>
    Pending = 0,

    /// <summary>Currently being processed by a worker.</summary>
    Processing = 1,

    /// <summary>Completed successfully.</summary>
    Done = 2,

    /// <summary>Failed too many times; moved to the dead-letter queue.</summary>
    Dead = 3
}
