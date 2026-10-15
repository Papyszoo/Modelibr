using SharedKernel;

namespace Application.StoreCatalog;

/// <summary>
/// The store is remote, so its failures are ordinary answers rather than faults. Each one
/// is distinguishable because the agent's next move differs: an unreachable store is worth
/// retrying later, and a missing asset means the listing it came from is stale.
/// </summary>
public static class StoreCatalogErrors
{
    public static Error Unreachable(string storeUrl) => new(
        "StoreCatalog.Unreachable",
        $"The Asset Store at {storeUrl} could not be reached. The local library is unaffected - " +
        "keep working from it, and treat this as a temporary condition rather than an empty store.");

    public static Error AssetNotFound(string storeAssetId) => new(
        "StoreCatalog.AssetNotFound",
        $"The Asset Store has no approved asset {storeAssetId}. A listing that named it is stale.");

    public static readonly Error InvalidStoreUrl = new(
        "StoreCatalog.InvalidStoreUrl",
        "The store URL is not usable: it must be an absolute https URL " +
        "(http is allowed only for a store on localhost).");
}
