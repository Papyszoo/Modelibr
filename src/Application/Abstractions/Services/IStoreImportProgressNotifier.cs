namespace Application.Abstractions.Services;

/// <summary>Live progress snapshot for a store import, pushed to UI clients over SignalR.</summary>
public sealed record StoreImportProgress(
    int JobId,
    string Status,
    int? PackId,
    int ItemsTotal,
    int ItemsProcessed,
    int ItemsCreated,
    int ItemsSkipped,
    int ItemsFailed,
    string? CurrentItem,
    string? Message);

/// <summary>
/// Pushes store-import progress to subscribed UI clients (SignalR in WebApi). Implementations
/// must never throw into the caller - a notification failure must not break the import.
/// </summary>
public interface IStoreImportProgressNotifier
{
    Task NotifyAsync(StoreImportProgress progress, CancellationToken cancellationToken = default);
}
