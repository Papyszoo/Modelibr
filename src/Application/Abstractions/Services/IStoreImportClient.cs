using Application.StoreImports;

namespace Application.Abstractions.Services;

/// <summary>
/// Server-to-server client for pulling an asset pack from the companion Asset Store.
/// The import token is passed per call and used only for the store's own host (see the
/// implementation) — it is never persisted or logged. SSRF guards, timeouts, redirect
/// limits and download size limits live in the implementation.
/// </summary>
public interface IStoreImportClient
{
    /// <summary>
    /// Fetches the asset manifest exactly once. This FIRST manifest fetch consumes the
    /// single-use import token; the same token then authorizes file downloads until it expires.
    /// </summary>
    Task<StoreManifest> FetchManifestAsync(
        string storeUrl,
        string assetId,
        string importToken,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Downloads a manifest file/preview from its absolute URL, following redirects guardedly
    /// (external-tier files 302 to public GitHub raw URLs). Fails if the payload wildly exceeds
    /// <paramref name="expectedSizeBytes"/> (from the manifest) or a redirect targets a
    /// private/loopback range.
    /// </summary>
    Task<byte[]> DownloadFileAsync(
        string storeUrl,
        string absoluteUrl,
        string importToken,
        long expectedSizeBytes,
        CancellationToken cancellationToken = default);
}
