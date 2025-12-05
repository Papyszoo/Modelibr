using Microsoft.AspNetCore.SignalR;

namespace WebApi.Hubs;

/// <summary>
/// SignalR hub for real-time thumbnail status notifications.
/// Replaces polling-based thumbnail status checking.
/// </summary>
public class ThumbnailHub : Hub
{
    /// <summary>
    /// Joins a group to receive notifications for a specific model version's thumbnail updates.
    /// </summary>
    /// <param name="modelVersionId">The model version ID to receive thumbnail updates for</param>
    public async Task JoinModelVersionGroup(string modelVersionId)
    {
        var groupName = GetModelVersionGroupName(modelVersionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
    }

    /// <summary>
    /// Leaves a group to stop receiving notifications for a specific model version's thumbnail updates.
    /// </summary>
    /// <param name="modelVersionId">The model version ID to stop receiving thumbnail updates for</param>
    public async Task LeaveModelVersionGroup(string modelVersionId)
    {
        var groupName = GetModelVersionGroupName(modelVersionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
    }

    /// <summary>
    /// Gets the SignalR group name for a model version's thumbnail notifications.
    /// </summary>
    /// <param name="modelVersionId">The model version ID</param>
    /// <returns>The group name</returns>
    public static string GetModelVersionGroupName(string modelVersionId)
    {
        return $"ModelVersion_{modelVersionId}_Thumbnails";
    }

    // Legacy methods for backwards compatibility
    
    /// <summary>
    /// Joins a group to receive notifications for a specific model's thumbnail updates.
    /// </summary>
    /// <param name="modelId">The model ID to receive thumbnail updates for</param>
    [Obsolete("Use JoinModelVersionGroup instead")]
    public async Task JoinModelGroup(string modelId)
    {
        var groupName = GetModelGroupName(modelId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
    }

    /// <summary>
    /// Leaves a group to stop receiving notifications for a specific model's thumbnail updates.
    /// </summary>
    /// <param name="modelId">The model ID to stop receiving thumbnail updates for</param>
    [Obsolete("Use LeaveModelVersionGroup instead")]
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
    [Obsolete("Use GetModelVersionGroupName instead")]
    public static string GetModelGroupName(string modelId)
    {
        return $"Model_{modelId}_Thumbnails";
    }
}