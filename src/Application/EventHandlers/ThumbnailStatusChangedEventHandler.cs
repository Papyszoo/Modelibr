using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Domain.Events;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.EventHandlers;

/// <summary>
/// Handles ThumbnailStatusChangedEvent by notifying clients.
/// Replaces the need for frontend polling.
/// </summary>
public class ThumbnailStatusChangedEventHandler : IDomainEventHandler<ThumbnailStatusChangedEvent>
{
    private readonly IThumbnailNotificationService _notificationService;
    private readonly ILogger<ThumbnailStatusChangedEventHandler> _logger;

    public ThumbnailStatusChangedEventHandler(
        IThumbnailNotificationService notificationService,
        ILogger<ThumbnailStatusChangedEventHandler> logger)
    {
        _notificationService = notificationService ?? throw new ArgumentNullException(nameof(notificationService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result> Handle(ThumbnailStatusChangedEvent domainEvent, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Handling ThumbnailStatusChangedEvent for model version {ModelVersionId} with status {Status}",
                domainEvent.ModelVersionId, domainEvent.Status);

            await _notificationService.SendThumbnailStatusChangedAsync(
                domainEvent.ModelVersionId,
                domainEvent.Status.ToString(),
                domainEvent.ThumbnailUrl,
                domainEvent.ErrorMessage,
                cancellationToken);

            _logger.LogInformation("Successfully sent thumbnail status notification for model version {ModelVersionId}",
                domainEvent.ModelVersionId);

            return Result.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send thumbnail status notification for model version {ModelVersionId}",
                domainEvent.ModelVersionId);

            return Result.Failure(new Error("ThumbnailNotificationFailed", 
                $"Failed to send thumbnail status notification for model version {domainEvent.ModelVersionId}: {ex.Message}"));
        }
    }
}