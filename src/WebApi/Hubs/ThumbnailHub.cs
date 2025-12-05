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
    /// Joins a group to receive notifications for active version changes of a specific model.
    /// </summary>
    /// <param name="modelId">The model ID to receive active version change notifications for</param>
    public async Task JoinModelActiveVersionGroup(string modelId)
    {
        var groupName = GetModelActiveVersionGroupName(modelId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
    }

    /// <summary>
    /// Leaves a group to stop receiving notifications for active version changes of a specific model.
    /// </summary>
    /// <param name="modelId">The model ID to stop receiving active version change notifications for</param>
    public async Task LeaveModelActiveVersionGroup(string modelId)
    {
        var groupName = GetModelActiveVersionGroupName(modelId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
    }

    /// <summary>
    /// Joins a broadcast group to receive notifications for all models' active version changes.
    /// Useful for models list view.
    /// </summary>
    public async Task JoinAllModelsGroup()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, AllModelsGroupName);
    }

    /// <summary>
    /// Leaves the broadcast group for all models' active version changes.
    /// </summary>
    public async Task LeaveAllModelsGroup()
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, AllModelsGroupName);
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

    /// <summary>
    /// Gets the SignalR group name for a model's active version change notifications.
    /// </summary>
    /// <param name="modelId">The model ID</param>
    /// <returns>The group name</returns>
    public static string GetModelActiveVersionGroupName(string modelId)
    {
        return $"Model_{modelId}_ActiveVersion";
    }

    /// <summary>
    /// Group name for clients that want to receive notifications for all models.
    /// </summary>
    public static string AllModelsGroupName => "AllModels_ActiveVersion";

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