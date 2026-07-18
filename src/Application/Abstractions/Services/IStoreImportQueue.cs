namespace Application.Abstractions.Services;

/// <summary>
/// In-memory work item for a queued store import. Holds the import token ONLY in memory for
/// the lifetime of the background job — it is never written to the persisted job row or logs.
/// </summary>
/// <param name="JobId">The persisted <c>StoreImportJob</c> id (progress is written back to it).</param>
/// <param name="StoreUrl">Validated store base URL.</param>
/// <param name="AssetId">Store asset id to import.</param>
/// <param name="ImportToken">Short-lived, asset-scoped, single-use store import token.</param>
/// <param name="SelectedItemIds">When non-empty, only these manifest item ids are imported (partial pack import); null/empty imports the whole pack.</param>
public sealed record StoreImportWorkItem(
    int JobId, string StoreUrl, string AssetId, string ImportToken, IReadOnlyList<string>? SelectedItemIds = null);

/// <summary>
/// Producer side of the in-process store-import queue. The endpoint/command enqueues; a
/// background service consumes and runs the import. Modeled on <c>BlendFileGenerationQueue</c>
/// (a Channel + BackgroundService), since the import is in-process pull work, not distributed
/// work handed to the external asset-processor.
/// </summary>
public interface IStoreImportQueue
{
    /// <summary>Enqueues a job for background processing. Returns false if the queue is saturated.</summary>
    bool Enqueue(StoreImportWorkItem workItem);
}
