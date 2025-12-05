using Application.Abstractions.Services;
using Microsoft.AspNetCore.SignalR;
using WebApi.Hubs;

namespace WebApi.Services;

/// <summary>
/// SignalR implementation of thumbnail notification service.
/// </summary>
public class SignalRThumbnailNotificationService : IThumbnailNotificationService
{
    private readonly IHubContext<ThumbnailHub> _hubContext;

    public SignalRThumbnailNotificationService(IHubContext<ThumbnailHub> hubContext)
    {
        _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
    }

    public async Task SendThumbnailStatusChangedAsync(int modelVersionId, string status, string? thumbnailUrl = null, string? errorMessage = null, CancellationToken cancellationToken = default)
    {
        var groupName = ThumbnailHub.GetModelVersionGroupName(modelVersionId.ToString());
        
        // Create the notification payload
        var notification = new
        {
            ModelVersionId = modelVersionId,
            Status = status,
            ThumbnailUrl = thumbnailUrl,
            ErrorMessage = errorMessage,
            Timestamp = DateTime.UtcNow
        };

        // Send notification to all clients in the model version group
        await _hubContext.Clients.Group(groupName)
            .SendAsync("ThumbnailStatusChanged", notification, cancellationToken);
    }

    public async Task SendActiveVersionChangedAsync(int modelId, int newActiveVersionId, int? previousActiveVersionId, bool hasThumbnail, string? thumbnailUrl = null, CancellationToken cancellationToken = default)
    {
        // Create the notification payload
        var notification = new
        {
            ModelId = modelId,
            NewActiveVersionId = newActiveVersionId,
            PreviousActiveVersionId = previousActiveVersionId,
            HasThumbnail = hasThumbnail,
            ThumbnailUrl = thumbnailUrl,
            Timestamp = DateTime.UtcNow
        };

        // Send to model-specific group
        var modelGroupName = ThumbnailHub.GetModelActiveVersionGroupName(modelId.ToString());
        await _hubContext.Clients.Group(modelGroupName)
            .SendAsync("ActiveVersionChanged", notification, cancellationToken);

        // Also send to the all-models group for models list view
        await _hubContext.Clients.Group(ThumbnailHub.AllModelsGroupName)
            .SendAsync("ActiveVersionChanged", notification, cancellationToken);
    }
}