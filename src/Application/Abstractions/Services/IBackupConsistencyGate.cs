namespace Application.Abstractions.Services;

/// <summary>
/// Coordinates the physical upload-file mutations that can affect a backup
/// archive with the archive snapshot itself. The gate is deliberately small:
/// it is not a general database locking subsystem, only a shared boundary for
/// the file-storage operations and backup enumeration that already have one
/// central implementation in this architecture.
/// </summary>
public interface IBackupConsistencyGate
{
    /// <summary>
    /// Waits until no backup snapshot is active, then holds a lease for a
    /// physical upload-file mutation. Request cancellation applies while waiting.
    /// </summary>
    ValueTask<IAsyncDisposable> EnterFileMutationAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Holds an exclusive lease while a backup takes its database dump and
    /// enumerates referenced files.
    /// </summary>
    ValueTask<IAsyncDisposable> EnterSnapshotAsync(CancellationToken cancellationToken = default);
}
