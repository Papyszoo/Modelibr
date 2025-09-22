using SharedKernel;

namespace Application.Abstractions.Services;

/// <summary>
/// Service for publishing domain events to their handlers.
/// </summary>
public interface IDomainEventDispatcher
{
    /// <summary>
    /// Publishes a collection of domain events to their registered handlers.
    /// </summary>
    /// <param name="domainEvents">The domain events to publish</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Result indicating success or failure</returns>
    Task<Result> PublishAsync(IEnumerable<IDomainEvent> domainEvents, CancellationToken cancellationToken = default);
}