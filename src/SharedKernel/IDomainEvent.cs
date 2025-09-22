namespace SharedKernel;

/// <summary>
/// Marker interface for domain events.
/// Domain events represent something significant that has occurred in the domain.
/// </summary>
public interface IDomainEvent
{
    /// <summary>
    /// Unique identifier for this event occurrence.
    /// </summary>
    Guid Id { get; }
    
    /// <summary>
    /// When this event occurred.
    /// </summary>
    DateTime OccurredAt { get; }
}