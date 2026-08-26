using SharedKernel;

namespace Application.StoreCatalog;

/// <summary>
/// The store is optional and remote, so its failures are ordinary answers rather than
/// faults. Each one is distinguishable because the agent's next move differs: an
/// unconfigured store is a setup question for the user, an unreachable store is worth
/// retrying later, and a missing asset means the listing it came from is stale.
/// </summary>
public static class StoreCatalogErrors
{
    public static readonly Error NotConfigured = new(
        "StoreCatalog.NotConfigured",
        "No companion Asset Store is configured. Set STORE_URL to browse one. " +
        "This does not affect the local library.");

    public static Error Unreachable(string storeUrl) => new(
        "StoreCatalog.Unreachable",
        $"The Asset Store at {storeUrl} could not be reached. The local library is unaffected - " +
        "keep working from it, and treat this as a temporary condition rather than an empty store.");

    public static Error AssetNotFound(string storeAssetId) => new(
        "StoreCatalog.AssetNotFound",
        $"The Asset Store has no approved asset {storeAssetId}. A listing that named it is stale.");

    public static readonly Error InvalidStoreUrl = new(
        "StoreCatalog.InvalidStoreUrl",
        "The configured STORE_URL is not usable: it must be an absolute https URL " +
        "(http is allowed only for a store on localhost).");
}
