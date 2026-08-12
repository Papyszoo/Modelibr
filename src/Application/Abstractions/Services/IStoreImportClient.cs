using Application.Abstractions.Files;
using Application.Files;
using Application.StoreImports;

namespace Application.Abstractions.Services;

/// <summary>
/// Server-to-server client for pulling an asset pack from the companion Asset Store.
/// The import token is passed per call and used only for the store's own host (see the
/// implementation) - it is never persisted or logged. SSRF guards, timeouts, redirect
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
    /// Downloads a manifest file/preview from its absolute URL to a temp file (never buffered
    /// in memory - pack files can be GB-sized), hashing while streaming. Follows redirects
    /// guardedly (external-tier files 302 to public GitHub raw URLs). Fails if the payload
    /// wildly exceeds <paramref name="expectedSizeBytes"/> (from the manifest) - or
    /// <paramref name="maxBytes"/> when given (previews carry no manifest size) - or a
    /// redirect targets a private/loopback range. The caller owns (and must dispose) the
    /// returned temp file.
    /// </summary>
    Task<StoreDownloadedFile> DownloadFileAsync(
        string storeUrl,
        string absoluteUrl,
        string importToken,
        long expectedSizeBytes,
        long? maxBytes = null,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// A downloaded store file parked in a temp file, with the SHA-256 computed while streaming.
/// Disposing deletes the temp file (best-effort; the OS temp dir is the backstop).
/// </summary>
public sealed class StoreDownloadedFile : IDisposable
{
    public StoreDownloadedFile(string tempPath, string sha256, long length)
    {
        TempPath = tempPath;
        Sha256 = sha256;
        Length = length;
    }

    public string TempPath { get; }

    /// <summary>Lowercase hex SHA-256 of the downloaded bytes.</summary>
    public string Sha256 { get; }

    public long Length { get; }

    public IFileUpload ToUpload(string fileName, string? contentType = null)
        => new TempFileUpload(TempPath, fileName, contentType);

    public void Dispose()
    {
        try
        {
            System.IO.File.Delete(TempPath);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
