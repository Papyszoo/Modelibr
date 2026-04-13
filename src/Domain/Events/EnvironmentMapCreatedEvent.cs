using SharedKernel;

namespace Domain.Events;

/// <summary>
/// Domain event raised when a new environment map is created.
/// </summary>
public class EnvironmentMapCreatedEvent : DomainEvent
{
    /// <summary>
    /// The ID of the newly created environment map.
    /// </summary>
    public int EnvironmentMapId { get; }

    /// <summary>
    /// The name of the newly created environment map.
    /// </summary>
    public string Name { get; }

    public EnvironmentMapCreatedEvent(int environmentMapId, string name)
    {
        EnvironmentMapId = environmentMapId;
        Name = name ?? throw new ArgumentNullException(nameof(name));
    }
}
