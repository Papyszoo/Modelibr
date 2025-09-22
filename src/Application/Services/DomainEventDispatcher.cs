using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.Services;

/// <summary>
/// Service for dispatching domain events to their registered handlers.
/// </summary>
internal class DomainEventDispatcher : IDomainEventDispatcher
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DomainEventDispatcher> _logger;

    public DomainEventDispatcher(
        IServiceProvider serviceProvider,
        ILogger<DomainEventDispatcher> logger)
    {
        _serviceProvider = serviceProvider ?? throw new ArgumentNullException(nameof(serviceProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result> PublishAsync(IEnumerable<IDomainEvent> domainEvents, CancellationToken cancellationToken = default)
    {
        if (domainEvents == null)
            return Result.Success();

        var eventsList = domainEvents.ToList();
        if (!eventsList.Any())
            return Result.Success();

        var errors = new List<Error>();

        foreach (var domainEvent in eventsList)
        {
            try
            {
                _logger.LogDebug("Publishing domain event {EventType} with ID {EventId}",
                    domainEvent.GetType().Name, domainEvent.Id);

                var result = await PublishSingleEventAsync(domainEvent, cancellationToken);
                if (!result.IsSuccess)
                {
                    errors.Add(result.Error);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error publishing domain event {EventType} with ID {EventId}",
                    domainEvent.GetType().Name, domainEvent.Id);

                errors.Add(new Error("DomainEventPublishingFailed", 
                    $"Unexpected error publishing {domainEvent.GetType().Name}: {ex.Message}"));
            }
        }

        if (errors.Any())
        {
            var combinedError = new Error("DomainEventPublishingErrors",
                $"Failed to publish {errors.Count} out of {eventsList.Count} domain events");
            return Result.Failure(combinedError);
        }

        _logger.LogDebug("Successfully published {EventCount} domain events", eventsList.Count);
        return Result.Success();
    }

    private async Task<Result> PublishSingleEventAsync(IDomainEvent domainEvent, CancellationToken cancellationToken)
    {
        var eventType = domainEvent.GetType();
        var handlerType = typeof(IDomainEventHandler<>).MakeGenericType(eventType);

        var handlers = _serviceProvider.GetServices(handlerType);
        
        if (!handlers.Any())
        {
            _logger.LogWarning("No handlers found for domain event {EventType}", eventType.Name);
            return Result.Success(); // Not an error - events may not have handlers
        }

        var errors = new List<Error>();

        foreach (var handler in handlers)
        {
            try
            {
                var handleMethod = handlerType.GetMethod("Handle");
                if (handleMethod != null)
                {
                    var taskResult = handleMethod.Invoke(handler, new object[] { domainEvent, cancellationToken });
                    if (taskResult is Task<Result> task)
                    {
                        var result = await task;
                        
                        if (!result.IsSuccess)
                        {
                            _logger.LogError("Handler {HandlerType} failed to process {EventType}: {Error}",
                                handler?.GetType().Name, eventType.Name, result.Error?.Message);
                            errors.Add(result.Error);
                        }
                        else
                        {
                            _logger.LogDebug("Handler {HandlerType} successfully processed {EventType}",
                                handler?.GetType().Name, eventType.Name);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Handler {HandlerType} threw exception processing {EventType}",
                    handler?.GetType().Name, eventType.Name);
                
                errors.Add(new Error("DomainEventHandlerException", 
                    $"Handler {handler?.GetType().Name} threw exception: {ex.Message}"));
            }
        }

        if (errors.Any())
        {
            var combinedError = new Error("DomainEventHandlingFailed",
                $"Failed to handle {eventType.Name} in {errors.Count} handlers");
            return Result.Failure(combinedError);
        }

        return Result.Success();
    }
}