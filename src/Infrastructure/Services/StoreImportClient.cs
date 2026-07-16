using System.Net;
using System.Net.Http.Headers;
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
/// private/loopback ranges (external-tier files 302 to GitHub raw), sends the import token
/// only to the store's own host, and caps download size using the manifest's file size.
/// The import token is never logged.
/// </summary>
internal sealed class StoreImportClient : IStoreImportClient
{
    public const string HttpClientName = "StoreImport";
    private const string ImportTokenScheme = "ImportToken";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<StoreImportClient> _logger;
    private readonly int _maxRedirects;
    private readonly long _absoluteMaxBytes;

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
    }

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

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var manifest = await JsonSerializer.DeserializeAsync<StoreManifest>(stream, ManifestJsonOptions, cancellationToken);
        if (manifest is null)
            throw new StoreImportException("Manifest response was empty or not valid JSON.");

        return manifest;
    }

    public async Task<byte[]> DownloadFileAsync(string storeUrl, string absoluteUrl, string importToken, long expectedSizeBytes, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(absoluteUrl, UriKind.Absolute, out var uri))
            throw new StoreImportException($"Download URL is not a valid absolute URL: '{absoluteUrl}'.");

        var storeUri = new Uri(storeUrl, UriKind.Absolute);

        var client = _httpClientFactory.CreateClient(HttpClientName);
        var maxAllowed = ComputeMaxAllowedBytes(expectedSizeBytes);

        for (var hop = 0; hop <= _maxRedirects; hop++)
        {
            await ValidateTargetAsync(uri, storeUri, cancellationToken);

            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            // Send the import token ONLY to the store's own host. A redirect to another host
            // (e.g. GitHub raw) is served without it, so the token never leaks cross-origin.
            if (StoreUrlSafety.IsSameHost(uri, storeUri))
                request.Headers.Authorization = new AuthenticationHeaderValue(ImportTokenScheme, importToken);

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

            return await ReadCappedAsync(response, maxAllowed, expectedSizeBytes, cancellationToken);
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

    private async Task ValidateTargetAsync(Uri uri, Uri storeUri, CancellationToken cancellationToken)
    {
        var targetCheck = StoreUrlSafety.ValidateDownloadTarget(uri, storeUri);
        if (targetCheck.IsFailure)
            throw new StoreImportException($"{targetCheck.Error.Code}: {targetCheck.Error.Message}");

        // The store's own host is trusted (may be a chosen LAN/loopback address) — no DNS check.
        if (StoreUrlSafety.IsSameHost(uri, storeUri))
            return;

        // Resolve hostnames and re-validate the resolved addresses so a hostname that points
        // at a private/loopback range is blocked too (not just IP literals).
        if (IPAddress.TryParse(uri.Host, out _))
            return; // already validated as a literal above

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
    }

    private static async Task<byte[]> ReadCappedAsync(HttpResponseMessage response, long maxAllowed, long expectedSizeBytes, CancellationToken cancellationToken)
    {
        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);

        var capacity = expectedSizeBytes > 0 && expectedSizeBytes <= maxAllowed ? (int)Math.Min(expectedSizeBytes, int.MaxValue) : 0;
        using var buffer = new MemoryStream(capacity);

        var chunk = new byte[81920];
        long total = 0;
        int read;
        while ((read = await source.ReadAsync(chunk.AsMemory(0, chunk.Length), cancellationToken)) > 0)
        {
            total += read;
            if (total > maxAllowed)
                throw new StoreImportException(
                    $"Download exceeded the allowed limit {maxAllowed} bytes (expected ~{expectedSizeBytes}).");
            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    private static bool IsRedirect(HttpStatusCode status) => (int)status is 301 or 302 or 303 or 307 or 308;
}
