namespace Application.Abstractions.Services;

/// <summary>
/// Abstraction for sending thumbnail status notifications.
/// </summary>
public interface IThumbnailNotificationService
{
    /// <summary>
    /// Sends a thumbnail status changed notification to clients interested in the model version.
    /// </summary>
    /// <param name="modelVersionId">The model version ID</param>
    /// <param name="status">The thumbnail status</param>
    /// <param name="thumbnailUrl">The thumbnail URL if ready, null otherwise</param>
    /// <param name="errorMessage">Error message if failed, null otherwise</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task SendThumbnailStatusChangedAsync(int modelVersionId, string status, string? thumbnailUrl = null, string? errorMessage = null, CancellationToken cancellationToken = default);
}