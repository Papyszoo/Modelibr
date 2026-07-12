using Application.Abstractions.Storage;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WebApi.Infrastructure;

/// <summary>
/// Runs <see cref="BlenderRetentionSweeper"/> once at startup and then on a fixed 24h
/// interval for the lifetime of the app. See <see cref="BlenderRetentionSweeper"/> for
/// the retention rules themselves; this class only owns the schedule.
///
/// A sweep failure is caught and logged, never rethrown — a bad sweep (e.g. a transient
/// disk error) must not crash the host or stop future sweeps from running.
/// </summary>
public sealed class BlenderRetentionSweepHostedService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(24);

    private readonly IUploadPathProvider _pathProvider;
    private readonly ILogger<BlenderRetentionSweepHostedService> _logger;

    public BlenderRetentionSweepHostedService(
        IUploadPathProvider pathProvider,
        ILogger<BlenderRetentionSweepHostedService> logger)
    {
        _pathProvider = pathProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var quarantine = new BlenderTempFileQuarantine(_pathProvider, _logger);
        var sweeper = new BlenderRetentionSweeper(_pathProvider, quarantine, _logger);

        using var timer = new PeriodicTimer(SweepInterval);

        // Run once immediately at startup, then again every tick of the timer.
        do
        {
            try
            {
                await sweeper.SweepAsync(DateTime.UtcNow, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Normal shutdown mid-sweep — not an error.
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "WebDAV retention sweep failed unexpectedly; will retry on the next interval");
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
