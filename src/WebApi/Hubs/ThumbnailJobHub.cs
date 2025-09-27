using Microsoft.AspNetCore.SignalR;

namespace WebApi.Hubs;

/// <summary>
/// SignalR hub for real-time thumbnail job queue notifications.
/// Allows workers to receive immediate notifications when jobs are available,
/// replacing the polling mechanism.
/// </summary>
public class ThumbnailJobHub : Hub
{
    /// <summary>
    /// Registers a worker to receive job queue notifications.
    /// </summary>
    /// <param name="workerId">The unique worker ID</param>
    public async Task RegisterWorker(string workerId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GetWorkersGroupName());
        await Clients.Caller.SendAsync("WorkerRegistered", new { WorkerId = workerId, Timestamp = DateTime.UtcNow });
    }

    /// <summary>
    /// Unregisters a worker from receiving job queue notifications.
    /// </summary>
    /// <param name="workerId">The unique worker ID</param>
    public async Task UnregisterWorker(string workerId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GetWorkersGroupName());
        await Clients.Caller.SendAsync("WorkerUnregistered", new { WorkerId = workerId, Timestamp = DateTime.UtcNow });
    }

    /// <summary>
    /// Acknowledges that a worker is processing a specific job.
    /// This helps with worker coordination and load balancing.
    /// </summary>
    /// <param name="jobId">The job ID being processed</param>
    /// <param name="workerId">The worker ID</param>
    public async Task AcknowledgeJobProcessing(int jobId, string workerId)
    {
        await Clients.Group(GetWorkersGroupName())
            .SendAsync("JobAcknowledged", new { JobId = jobId, WorkerId = workerId, Timestamp = DateTime.UtcNow });
    }

    /// <summary>
    /// Gets the SignalR group name for all workers.
    /// </summary>
    /// <returns>The workers group name</returns>
    public static string GetWorkersGroupName()
    {
        return "ThumbnailWorkers";
    }

    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}