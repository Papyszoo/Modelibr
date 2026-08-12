namespace Domain.ValueObjects;

/// <summary>
/// Lifecycle status of a store-import background job.
/// </summary>
public enum StoreImportJobStatus
{
    /// <summary>Job created and queued, not yet picked up by the background processor.</summary>
    Pending = 0,

    /// <summary>The background processor is actively pulling the pack.</summary>
    Running = 1,

    /// <summary>All items imported (or deduplicated) with no failures.</summary>
    Completed = 2,

    /// <summary>The pack was imported but one or more items failed; the job is re-runnable to fill gaps.</summary>
    CompletedWithErrors = 3,

    /// <summary>The whole import aborted (e.g. manifest fetch failed) before any items could be processed.</summary>
    Failed = 4
}
