using SharedKernel;

namespace Application.Abstractions.Messaging;

/// <summary>
/// Handler for domain events.
/// </summary>
/// <typeparam name="TDomainEvent">The type of domain event to handle</typeparam>
public interface IDomainEventHandler<in TDomainEvent> where TDomainEvent : IDomainEvent
{
    /// <summary>
    /// Handles the domain event.
    /// </summary>
    /// <param name="domainEvent">The domain event to handle</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Result of handling the event</returns>
    Task<Result> Handle(TDomainEvent domainEvent, CancellationToken cancellationToken);
}