using SharedKernel;

namespace Domain.Events;

/// <summary>
/// Domain event raised when an environment map is soft-deleted.
/// </summary>
public class EnvironmentMapDeletedEvent : DomainEvent
{
    /// <summary>
    /// The ID of the deleted environment map.
    /// </summary>
    public int EnvironmentMapId { get; }

    public EnvironmentMapDeletedEvent(int environmentMapId)
    {
        EnvironmentMapId = environmentMapId;
    }
}
