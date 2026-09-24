using Application.Abstractions.Services;

namespace Infrastructure.Services;

/// <summary>
/// Small process-local gate for the physical upload-file operations that the
/// existing file-storage implementation centralizes. A backup takes the one
/// exclusive lease; file mutations take the competing lease and are cancelled
/// normally when their request is cancelled while a backup is running.
/// </summary>
public sealed class BackupConsistencyGate : IBackupConsistencyGate
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    public ValueTask<IAsyncDisposable> EnterFileMutationAsync(CancellationToken cancellationToken = default)
        => WaitAsync(cancellationToken);

    public ValueTask<IAsyncDisposable> EnterSnapshotAsync(CancellationToken cancellationToken = default)
        => WaitAsync(cancellationToken);

    private async ValueTask<IAsyncDisposable> WaitAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        return new Lease(this);
    }

    private void Release() => _gate.Release();

    private sealed class Lease : IAsyncDisposable
    {
        private BackupConsistencyGate? _owner;

        public Lease(BackupConsistencyGate owner) => _owner = owner;

        public ValueTask DisposeAsync()
        {
            Interlocked.Exchange(ref _owner, null)?.Release();
            return ValueTask.CompletedTask;
        }
    }
}
