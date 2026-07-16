using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using Application.Abstractions.Services;
using Application.StoreImports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

/// <summary>
/// SSRF-hardened, server-to-server store client (v0.5 prompt 05). Treats <c>storeUrl</c> and
/// the manifest's absolute URLs as untrusted: requires https (http only for loopback),
/// follows redirects manually with a hop cap while re-validating each target against
/// private/loopback ranges (external-tier files 302 to GitHub raw), pins the DNS-validated
/// address for the actual connection (no rebinding TOCTOU), sends the import token only to
/// the store's own host, and caps download size using the manifest's file size. Files stream
/// to temp files (hashed en route) — payloads are never buffered in memory. The import token
/// is never logged.
/// </summary>
internal sealed class StoreImportClient : IStoreImportClient
{
    public const string HttpClientName = "StoreImport";
    private const string ImportTokenScheme = "ImportToken";
    private const string TempSubdirectory = "modelibr-store-import";

    /// <summary>
    /// Per-request option carrying the address that passed SSRF validation. The primary
    /// handler's ConnectCallback dials THIS address (TLS/SNI still use the URI host), so a
    /// hostname cannot re-resolve to a private range between validation and connection.
    /// </summary>
    private static readonly HttpRequestOptionsKey<IPAddress> PinnedAddressKey = new("Modelibr.StoreImport.PinnedAddress");

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<StoreImportClient> _logger;
    private readonly int _maxRedirects;
    private readonly long _absoluteMaxBytes;
    private readonly long _maxManifestBytes;

    private static readonly JsonSerializerOptions ManifestJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public StoreImportClient(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<StoreImportClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _maxRedirects = Math.Clamp(configuration.GetValue<int?>("STORE_IMPORT_MAX_REDIRECTS") ?? 5, 0, 10);
        _absoluteMaxBytes = configuration.GetValue<long?>("STORE_IMPORT_MAX_FILE_BYTES") ?? 2_147_483_648L; // 2 GiB
        _maxManifestBytes = configuration.GetValue<long?>("STORE_IMPORT_MAX_MANIFEST_BYTES") ?? 16_777_216L; // 16 MiB
    }

    /// <summary>
    /// Primary handler for the named client: manual redirects (auto-redirect would bypass the
    /// per-hop SSRF validation) and a ConnectCallback honoring <see cref="PinnedAddressKey"/>.
    /// </summary>
    public static SocketsHttpHandler CreatePrimaryHandler()
        => new()
        {
            AllowAutoRedirect = false,
            ConnectCallback = static async (context, cancellationToken) =>
            {
                var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                try
                {
                    if (context.InitialRequestMessage.Options.TryGetValue(PinnedAddressKey, out var pinned))
                        await socket.ConnectAsync(pinned, context.DnsEndPoint.Port, cancellationToken);
                    else
                        await socket.ConnectAsync(context.DnsEndPoint.Host, context.DnsEndPoint.Port, cancellationToken);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            }
        };

    public async Task<StoreManifest> FetchManifestAsync(string storeUrl, string assetId, string importToken, CancellationToken cancellationToken)
    {
        var baseValidation = StoreUrlSafety.ValidateStoreBaseUrl(storeUrl);
        if (baseValidation.IsFailure)
            throw new StoreImportException($"{baseValidation.Error.Code}: {baseValidation.Error.Message}");

        var manifestUri = new Uri(new Uri(storeUrl.TrimEnd('/') + "/"), $"api/assets/{Uri.EscapeDataString(assetId)}/manifest");

        using var request = new HttpRequestMessage(HttpMethod.Get, manifestUri);
        request.Headers.Authorization = new AuthenticationHeaderValue(ImportTokenScheme, importToken);

        var client = _httpClientFactory.CreateClient(HttpClientName);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new StoreImportException($"Manifest fetch failed ({(int)response.StatusCode} {response.ReasonPhrase}).");
        }

        // The manifest comes from an untrusted host too — cap it instead of handing the
        // deserializer an unbounded stream.
        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var buffer = new MemoryStream();
        await CopyCappedAsync(source, buffer, _maxManifestBytes,
            $"Manifest exceeded the allowed size ({_maxManifestBytes} bytes).", cancellationToken);
        buffer.Position = 0;

        var manifest = await JsonSerializer.DeserializeAsync<StoreManifest>(buffer, ManifestJsonOptions, cancellationToken);
        if (manifest is null)
            throw new StoreImportException("Manifest response was empty or not valid JSON.");

        return manifest;
    }

    public async Task<StoreDownloadedFile> DownloadFileAsync(
        string storeUrl, string absoluteUrl, string importToken, long expectedSizeBytes, long? maxBytes, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(absoluteUrl, UriKind.Absolute, out var uri))
            throw new StoreImportException($"Download URL is not a valid absolute URL: '{absoluteUrl}'.");

        var storeUri = new Uri(storeUrl, UriKind.Absolute);

        var client = _httpClientFactory.CreateClient(HttpClientName);
        var maxAllowed = maxBytes is > 0
            ? Math.Min(maxBytes.Value, _absoluteMaxBytes)
            : ComputeMaxAllowedBytes(expectedSizeBytes);

        for (var hop = 0; hop <= _maxRedirects; hop++)
        {
            var pinnedAddress = await ValidateTargetAsync(uri, storeUri, cancellationToken);

            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            // Send the import token ONLY to the store's own host. A redirect to another host
            // (e.g. GitHub raw) is served without it, so the token never leaks cross-origin.
            if (StoreUrlSafety.IsSameHost(uri, storeUri))
                request.Headers.Authorization = new AuthenticationHeaderValue(ImportTokenScheme, importToken);
            if (pinnedAddress is not null)
                request.Options.Set(PinnedAddressKey, pinnedAddress);

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);

            if (IsRedirect(response.StatusCode))
            {
                var location = response.Headers.Location
                    ?? throw new StoreImportException($"Redirect ({(int)response.StatusCode}) with no Location header.");
                uri = new Uri(uri, location);
                continue;
            }

            if (!response.IsSuccessStatusCode)
                throw new StoreImportException($"Download failed ({(int)response.StatusCode} {response.ReasonPhrase}).");

            if (response.Content.Headers.ContentLength is long declared && declared > maxAllowed)
                throw new StoreImportException(
                    $"Download size {declared} bytes exceeds the allowed limit {maxAllowed} bytes (expected ~{expectedSizeBytes}).");

            return await ReadToTempFileAsync(response, maxAllowed, expectedSizeBytes, cancellationToken);
        }

        throw new StoreImportException($"Too many redirects (> {_maxRedirects}) while downloading.");
    }

    private long ComputeMaxAllowedBytes(long expectedSizeBytes)
    {
        if (expectedSizeBytes <= 0)
            return _absoluteMaxBytes;

        // Allow generous slack over the manifest size but never above the absolute cap.
        var slack = Math.Max(expectedSizeBytes / 2, 1_048_576L);
        var allowed = expectedSizeBytes + slack;
        return Math.Min(allowed, _absoluteMaxBytes);
    }

    /// <summary>
    /// SSRF-validates a download/redirect target. Returns the address to pin the connection
    /// to when the target is a non-store hostname (so the request cannot re-resolve
    /// elsewhere), or null when no pin is needed (store host, or an IP-literal target that
    /// needs no DNS).
    /// </summary>
    private async Task<IPAddress?> ValidateTargetAsync(Uri uri, Uri storeUri, CancellationToken cancellationToken)
    {
        var targetCheck = StoreUrlSafety.ValidateDownloadTarget(uri, storeUri);
        if (targetCheck.IsFailure)
            throw new StoreImportException($"{targetCheck.Error.Code}: {targetCheck.Error.Message}");

        // The store's own host is trusted (may be a chosen LAN/loopback address) — no DNS check.
        if (StoreUrlSafety.IsSameHost(uri, storeUri))
            return null;

        // IP literals were classified in ValidateDownloadTarget and need no DNS (or pin).
        if (IPAddress.TryParse(uri.Host, out _))
            return null;

        // Resolve hostnames and validate the resolved addresses so a hostname that points at
        // a private/loopback range is blocked too. The first safe address is pinned for the
        // connection itself — otherwise a 0-TTL DNS record could pass validation here and
        // re-resolve to a private address when the request connects (rebinding TOCTOU).
        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(uri.Host, cancellationToken);
        }
        catch (Exception ex)
        {
            throw new StoreImportException($"Could not resolve download host '{uri.Host}': {ex.Message}");
        }

        if (addresses.Length == 0)
            throw new StoreImportException($"Download host '{uri.Host}' did not resolve to any address.");

        // Not the store's own host (returned early above), so loopback is only tolerated when
        // the store itself is loopback (dev); private/link-local is always blocked.
        var allowLoopback = StoreUrlSafety.IsLoopbackHost(storeUri);
        foreach (var address in addresses)
        {
            if (StoreUrlSafety.IsBlockedAddress(address, allowLoopback))
                throw new StoreImportException($"Refusing to download from '{uri.Host}' — it resolves to a private/loopback address.");
        }

        return addresses[0];
    }

    private static async Task<StoreDownloadedFile> ReadToTempFileAsync(
        HttpResponseMessage response, long maxAllowed, long expectedSizeBytes, CancellationToken cancellationToken)
    {
        var directory = Path.Combine(Path.GetTempPath(), TempSubdirectory);
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");

        try
        {
            await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var sha = SHA256.Create();
            long total = 0;

            await using (var target = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                var chunk = new byte[81920];
                int read;
                while ((read = await source.ReadAsync(chunk.AsMemory(0, chunk.Length), cancellationToken)) > 0)
                {
                    total += read;
                    if (total > maxAllowed)
                        throw new StoreImportException(
                            $"Download exceeded the allowed limit {maxAllowed} bytes (expected ~{expectedSizeBytes}).");
                    sha.TransformBlock(chunk, 0, read, null, 0);
                    await target.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
                }
            }

            sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
            var hash = Convert.ToHexString(sha.Hash!).ToLowerInvariant();
            return new StoreDownloadedFile(path, hash, total);
        }
        catch
        {
            try { System.IO.File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            throw;
        }
    }

    private static async Task CopyCappedAsync(Stream source, Stream target, long maxBytes, string overflowMessage, CancellationToken cancellationToken)
    {
        var chunk = new byte[81920];
        long total = 0;
        int read;
        while ((read = await source.ReadAsync(chunk.AsMemory(0, chunk.Length), cancellationToken)) > 0)
        {
            total += read;
            if (total > maxBytes)
                throw new StoreImportException(overflowMessage);
            await target.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }
    }

    private static bool IsRedirect(HttpStatusCode status) => (int)status is 301 or 302 or 303 or 307 or 308;
}
