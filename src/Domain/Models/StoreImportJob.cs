using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Tracks a background import of an asset pack pulled from the companion Asset Store
/// (v0.5 prompt 05). Persisted so the POST endpoint can hand back a job id and a later
/// GET can report per-item outcomes; live progress additionally surfaces over SignalR.
///
/// SECURITY: the store import token is deliberately NOT modeled here. It is short-lived,
/// asset-scoped and single-use; it flows only through the in-memory work item to the
/// background processor and is never persisted or logged. Only the store URL + asset id
/// (provenance, needed for the future "update my pack" flow) live on this row.
/// </summary>
public class StoreImportJob
{
    public int Id { get; private set; }

    /// <summary>Base URL of the store the pack was pulled from (validated, no token).</summary>
    public string StoreUrl { get; private set; } = string.Empty;

    /// <summary>The store's asset id (opaque GUID string) this job imports.</summary>
    public string StoreAssetId { get; private set; } = string.Empty;

    /// <summary>Manifest schema version seen for this run (0 until the manifest is fetched).</summary>
    public int ManifestSchemaVersion { get; private set; }

    public StoreImportJobStatus Status { get; private set; } = StoreImportJobStatus.Pending;

    /// <summary>The pack created (or reused) by this import; null until it is resolved.</summary>
    public int? PackId { get; private set; }

    public int ItemsTotal { get; private set; }
    public int ItemsCreated { get; private set; }
    public int ItemsSkipped { get; private set; }
    public int ItemsFailed { get; private set; }

    /// <summary>Serialized per-item outcomes (created / skipped-dedupe / skipped-unsupported / failed+reason).</summary>
    public string? ResultJson { get; private set; }

    /// <summary>Populated only when the whole job aborts before/around item processing.</summary>
    public string? ErrorMessage { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public DateTime? CompletedAt { get; private set; }

    private StoreImportJob() { }

    public static StoreImportJob Create(string storeUrl, string storeAssetId, DateTime createdAt)
    {
        if (string.IsNullOrWhiteSpace(storeUrl))
            throw new ArgumentException("Store URL cannot be null or empty.", nameof(storeUrl));
        if (storeUrl.Length > 500)
            throw new ArgumentException("Store URL cannot exceed 500 characters.", nameof(storeUrl));
        if (string.IsNullOrWhiteSpace(storeAssetId))
            throw new ArgumentException("Store asset id cannot be null or empty.", nameof(storeAssetId));
        if (storeAssetId.Length > 200)
            throw new ArgumentException("Store asset id cannot exceed 200 characters.", nameof(storeAssetId));

        return new StoreImportJob
        {
            StoreUrl = storeUrl.Trim(),
            StoreAssetId = storeAssetId.Trim(),
            Status = StoreImportJobStatus.Pending,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void MarkRunning(DateTime now)
    {
        Status = StoreImportJobStatus.Running;
        UpdatedAt = now;
    }

    public void SetManifestVersion(int schemaVersion, DateTime now)
    {
        ManifestSchemaVersion = schemaVersion;
        UpdatedAt = now;
    }

    public void SetPack(int packId, DateTime now)
    {
        if (packId <= 0)
            throw new ArgumentException("Pack id must be a positive integer.", nameof(packId));
        PackId = packId;
        UpdatedAt = now;
    }

    public void SetItemTotal(int total, DateTime now)
    {
        if (total < 0)
            throw new ArgumentException("Item total cannot be negative.", nameof(total));
        ItemsTotal = total;
        UpdatedAt = now;
    }

    /// <summary>
    /// Records the final per-item tally and result log. Status becomes
    /// <see cref="StoreImportJobStatus.CompletedWithErrors"/> when any item failed,
    /// otherwise <see cref="StoreImportJobStatus.Completed"/>.
    /// </summary>
    public void Complete(int created, int skipped, int failed, string? resultJson, DateTime completedAt)
    {
        ItemsCreated = created;
        ItemsSkipped = skipped;
        ItemsFailed = failed;
        ResultJson = resultJson;
        Status = failed > 0 ? StoreImportJobStatus.CompletedWithErrors : StoreImportJobStatus.Completed;
        CompletedAt = completedAt;
        UpdatedAt = completedAt;
    }

    public void Fail(string errorMessage, DateTime now)
    {
        ErrorMessage = string.IsNullOrWhiteSpace(errorMessage)
            ? "Import failed."
            : errorMessage.Length > 2000 ? errorMessage[..2000] : errorMessage;
        Status = StoreImportJobStatus.Failed;
        CompletedAt = now;
        UpdatedAt = now;
    }
}
