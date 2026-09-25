using Infrastructure.Services;
using Xunit;

namespace Infrastructure.Tests.Services;

public sealed class BackupConsistencyGateTests
{
    [Fact]
    public async Task SnapshotLease_BlocksFileMutationUntilSnapshotIsReleased()
    {
        var gate = new BackupConsistencyGate();

        var snapshot = await gate.EnterSnapshotAsync();
        var mutation = gate.EnterFileMutationAsync().AsTask();

        Assert.False(mutation.IsCompleted);

        await snapshot.DisposeAsync();
        await using var mutationLease = await mutation.WaitAsync(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task WaitingFileMutation_HonorsCancellationWhileSnapshotIsActive()
    {
        var gate = new BackupConsistencyGate();
        await using var snapshot = await gate.EnterSnapshotAsync();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => gate.EnterFileMutationAsync(cancellation.Token).AsTask());
    }
}
