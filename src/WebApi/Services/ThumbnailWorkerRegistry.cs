using System.Collections.Concurrent;

namespace WebApi.Services;

/// <summary>
/// Latest reported state of a thumbnail worker. <see cref="RenderBackend"/> is
/// the renderer backend the worker came up on ("WebGPU" or "WebGL2"), or null
/// until it has initialised a renderer for its first job.
/// </summary>
public sealed record ThumbnailWorkerInfo(
    string WorkerId,
    string? RenderBackend,
    DateTimeOffset LastSeenUtc);

/// <summary>
/// In-memory registry of thumbnail workers, fed by their job-poll requests, so
/// the app can surface worker capabilities (e.g. WebGPU vs WebGL2) in Settings.
/// Operational telemetry only — intentionally not persisted.
/// </summary>
public interface IThumbnailWorkerRegistry
{
    /// <summary>Record a worker poll, updating its backend and last-seen time.</summary>
    void Report(string? workerId, string? renderBackend);

    /// <summary>Snapshot of all workers seen this process lifetime.</summary>
    IReadOnlyCollection<ThumbnailWorkerInfo> GetWorkers();
}

public sealed class ThumbnailWorkerRegistry : IThumbnailWorkerRegistry
{
    private readonly ConcurrentDictionary<string, ThumbnailWorkerInfo> _workers = new();

    public void Report(string? workerId, string? renderBackend)
    {
        if (string.IsNullOrWhiteSpace(workerId))
        {
            return;
        }

        var backend = string.IsNullOrWhiteSpace(renderBackend) ? null : renderBackend;

        _workers.AddOrUpdate(
            workerId,
            _ => new ThumbnailWorkerInfo(workerId, backend, DateTimeOffset.UtcNow),
            // Keep a previously-detected backend if the worker reports null (it
            // sends null before its first render), so the UI doesn't flap back
            // to "detecting" once a backend has been established.
            (_, existing) => existing with
            {
                RenderBackend = backend ?? existing.RenderBackend,
                LastSeenUtc = DateTimeOffset.UtcNow,
            });
    }

    public IReadOnlyCollection<ThumbnailWorkerInfo> GetWorkers() => _workers.Values.ToArray();
}
