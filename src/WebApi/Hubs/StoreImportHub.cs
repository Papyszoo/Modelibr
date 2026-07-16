using Microsoft.AspNetCore.SignalR;

namespace WebApi.Hubs;

/// <summary>
/// SignalR hub for live store-import progress. A UI client joins the group for the job id it
/// started (returned by POST /store-imports) and receives "ImportProgress" events.
/// </summary>
public class StoreImportHub : Hub
{
    public Task JoinJobGroup(string jobId)
        => Groups.AddToGroupAsync(Context.ConnectionId, GetJobGroupName(jobId));

    public Task LeaveJobGroup(string jobId)
        => Groups.RemoveFromGroupAsync(Context.ConnectionId, GetJobGroupName(jobId));

    public static string GetJobGroupName(int jobId) => $"StoreImport_{jobId}";

    public static string GetJobGroupName(string jobId) => $"StoreImport_{jobId}";
}
