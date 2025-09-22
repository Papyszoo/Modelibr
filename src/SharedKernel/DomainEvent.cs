namespace SharedKernel;

/// <summary>
/// Base class for domain events providing common properties.
/// </summary>
public abstract class DomainEvent : IDomainEvent
{
    public Guid Id { get; } = Guid.NewGuid();
    public DateTime OccurredAt { get; } = DateTime.UtcNow;

    protected DomainEvent()
    {
    }
}