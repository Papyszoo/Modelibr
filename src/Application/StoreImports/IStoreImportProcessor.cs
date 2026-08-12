using Application.Abstractions.Services;

namespace Application.StoreImports;

/// <summary>
/// Runs a single queued store import to completion: fetch manifest, create/reuse the pack,
/// import each item through the existing command handlers (with SHA dedupe, hash verification
/// and per-item outcomes), and write progress + the final tally back to the job row. Resolved
/// per job in its own DI scope by the background queue.
/// </summary>
public interface IStoreImportProcessor
{
    Task ProcessAsync(StoreImportWorkItem workItem, CancellationToken cancellationToken = default);
}
