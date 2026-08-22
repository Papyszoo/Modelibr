using Application.StoreCatalog;
using SharedKernel;

namespace Application.Abstractions.Services;

/// <summary>
/// Reads the companion Asset Store's <b>public</b> catalog. Anonymous by design: the store
/// serves search, asset detail and preview artifacts with no credential at all, and this
/// client deliberately holds none - it never sees the user's store JWT, and never mints or
/// presents an import token. Acquiring an asset is a different operation with a different
/// credential story (see <see cref="IStoreImportClient"/>).
/// </summary>
public interface IStoreCatalogClient
{
    /// <summary>The configured store, or null when none is configured.</summary>
    string? StoreUrl { get; }

    Task<Result<StoreCatalogPage>> SearchAsync(
        StoreCatalogQuery query,
        CancellationToken cancellationToken);

    Task<Result<StoreCatalogAsset>> GetAssetAsync(
        string storeAssetId,
        CancellationToken cancellationToken);
}
