using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WebApi.Infrastructure;

/// <summary>
/// Runs <see cref="RecycledFilePurgeService"/> once at startup and then on a
/// fixed 24h interval. See the service for the retention rules; this class only
/// owns the schedule. A sweep failure is caught and logged, never rethrown.
/// </summary>
public sealed class RecycledFilePurgeHostedService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RecycledFilePurgeHostedService> _logger;

    public RecycledFilePurgeHostedService(
        IServiceScopeFactory scopeFactory,
        ILogger<RecycledFilePurgeHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(SweepInterval);

        // Run once immediately at startup, then again every tick of the timer.
        do
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var purger = scope.ServiceProvider.GetRequiredService<RecycledFilePurgeService>();
                await purger.PurgeAsync(DateTime.UtcNow, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Normal shutdown mid-sweep - not an error.
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Recycled-file purge failed unexpectedly; will retry on the next interval");
            }
        }
        while (await WaitForNextTickAsync(timer, stoppingToken));
    }

    private static async Task<bool> WaitForNextTickAsync(PeriodicTimer timer, CancellationToken stoppingToken)
    {
        try
        {
            return await timer.WaitForNextTickAsync(stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }
}
