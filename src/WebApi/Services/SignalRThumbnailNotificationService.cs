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

    public async Task SendThumbnailStatusChangedAsync(int modelId, string status, string? thumbnailUrl = null, string? errorMessage = null, CancellationToken cancellationToken = default)
    {
        var groupName = ThumbnailHub.GetModelGroupName(modelId.ToString());
        
        // Create the notification payload
        var notification = new
        {
            ModelId = modelId,
            Status = status,
            ThumbnailUrl = thumbnailUrl,
            ErrorMessage = errorMessage,
            Timestamp = DateTime.UtcNow
        };

        // Send notification to all clients in the model group
        await _hubContext.Clients.Group(groupName)
            .SendAsync("ThumbnailStatusChanged", notification, cancellationToken);
    }
}