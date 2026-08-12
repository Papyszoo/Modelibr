using Application.Abstractions.Services;
using Microsoft.AspNetCore.SignalR;
using WebApi.Hubs;

namespace WebApi.Services;

/// <summary>
/// SignalR implementation of <see cref="IStoreImportProgressNotifier"/>. Sends progress to the
/// job's group. Never throws into the caller - a notification failure must not break an import.
/// </summary>
public class SignalRStoreImportProgressNotifier : IStoreImportProgressNotifier
{
    private readonly IHubContext<StoreImportHub> _hubContext;
    private readonly ILogger<SignalRStoreImportProgressNotifier> _logger;

    public SignalRStoreImportProgressNotifier(
        IHubContext<StoreImportHub> hubContext,
        ILogger<SignalRStoreImportProgressNotifier> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
    }

    public async Task NotifyAsync(StoreImportProgress progress, CancellationToken cancellationToken = default)
    {
        try
        {
            await _hubContext.Clients
                .Group(StoreImportHub.GetJobGroupName(progress.JobId))
                .SendAsync("ImportProgress", progress, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send store import progress for job {JobId}", progress.JobId);
        }
    }
}
