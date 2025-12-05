using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Domain.Events;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.EventHandlers;

/// <summary>
/// Handles ActiveVersionChangedEvent by notifying clients via SignalR.
/// This allows the frontend to update the displayed thumbnail when the active version changes.
/// </summary>
public class ActiveVersionChangedEventHandler : IDomainEventHandler<ActiveVersionChangedEvent>
{
    private readonly IThumbnailNotificationService _notificationService;
    private readonly ILogger<ActiveVersionChangedEventHandler> _logger;

    public ActiveVersionChangedEventHandler(
        IThumbnailNotificationService notificationService,
        ILogger<ActiveVersionChangedEventHandler> logger)
    {
        _notificationService = notificationService ?? throw new ArgumentNullException(nameof(notificationService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result> Handle(ActiveVersionChangedEvent domainEvent, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation(
                "Handling ActiveVersionChangedEvent for model {ModelId}: version changed from {PreviousVersionId} to {NewVersionId}",
                domainEvent.ModelId, 
                domainEvent.PreviousActiveVersionId, 
                domainEvent.NewActiveVersionId);

            await _notificationService.SendActiveVersionChangedAsync(
                domainEvent.ModelId,
                domainEvent.NewActiveVersionId,
                domainEvent.PreviousActiveVersionId,
                domainEvent.HasThumbnail,
                domainEvent.ThumbnailUrl,
                cancellationToken);

            _logger.LogInformation(
                "Successfully sent active version changed notification for model {ModelId}",
                domainEvent.ModelId);

            return Result.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, 
                "Failed to send active version changed notification for model {ModelId}",
                domainEvent.ModelId);

            return Result.Failure(new Error(
                "ActiveVersionNotificationFailed", 
                $"Failed to send active version changed notification for model {domainEvent.ModelId}: {ex.Message}"));
        }
    }
}
