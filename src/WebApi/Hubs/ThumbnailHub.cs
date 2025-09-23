using Microsoft.AspNetCore.SignalR;

namespace WebApi.Hubs;

/// <summary>
/// SignalR hub for real-time thumbnail status notifications.
/// Replaces polling-based thumbnail status checking.
/// </summary>
public class ThumbnailHub : Hub
{
    /// <summary>
    /// Joins a group to receive notifications for a specific model's thumbnail updates.
    /// </summary>
    /// <param name="modelId">The model ID to receive thumbnail updates for</param>
    public async Task JoinModelGroup(string modelId)
    {
        var groupName = GetModelGroupName(modelId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
    }

    /// <summary>
    /// Leaves a group to stop receiving notifications for a specific model's thumbnail updates.
    /// </summary>
    /// <param name="modelId">The model ID to stop receiving thumbnail updates for</param>
    public async Task LeaveModelGroup(string modelId)
    {
        var groupName = GetModelGroupName(modelId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
    }

    /// <summary>
    /// Gets the SignalR group name for a model's thumbnail notifications.
    /// </summary>
    /// <param name="modelId">The model ID</param>
    /// <returns>The group name</returns>
    public static string GetModelGroupName(string modelId)
    {
        return $"Model_{modelId}_Thumbnails";
    }
}