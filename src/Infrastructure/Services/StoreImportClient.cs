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
/// private/loopback ranges (external-tier files 302 to GitHub raw), refuses any https→http
/// downgrade, pins the DNS-validated address for the actual connection (no rebinding TOCTOU),
/// sends the import token only to the store's own ORIGIN (scheme included, so a downgraded
/// hop never carries it), and caps download size using the manifest's file size. Files stream
/// to temp files (hashed en route) - payloads are never buffered in memory. The import token
/// is never logged.
/// </summary>
internal sealed class StoreImportClient : IStoreImportClient
{
    public const string HttpClientName = "StoreImport";
    private const string ImportTokenScheme = "ImportToken";
    private const string TempSubdirectory = "modelibr-store-import";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<StoreImportClient> _logger;
    private readonly int _maxRedirects;
    private readonly long _absoluteMaxBytes;
    private readonly long _maxManifestBytes;

    /// <summary>
    /// Address classification and connection pinning, shared with the catalog client. Lives
    /// there rather than here because a second store client that skipped it was not a second
    /// implementation - it was a hole.
    /// </summary>
    private readonly StoreEndpointGuard _endpoints;

    /// <summary>
    /// Test seam for the pin's host lookup. Not a constructor parameter: the DI container has
    /// no registration for it and would fail to pick the constructor.
    /// </summary>
    internal Func<string, CancellationToken, Task<IPAddress[]>> ResolveHostAsync
    {
        get => _endpoints.ResolveHostAsync;
        set => _endpoints.ResolveHostAsync = value;
    }

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
        _endpoints = new StoreEndpointGuard(logger);
        _maxRedirects = Math.Clamp(configuration.GetValue<int?>("STORE_IMPORT_MAX_REDIRECTS") ?? 5, 0, 10);
        _absoluteMaxBytes = configuration.GetValue<long?>("STORE_IMPORT_MAX_FILE_BYTES") ?? 2_147_483_648L; // 2 GiB
        _maxManifestBytes = configuration.GetValue<long?>("STORE_IMPORT_MAX_MANIFEST_BYTES") ?? 16_777_216L; // 16 MiB
    }

    /// <summary>
    /// Primary handler for the named client: manual redirects (auto-redirect would bypass the
    /// per-hop SSRF validation) and a ConnectCallback honoring <see cref="PinnedAddressKey"/>.
    /// </summary>
    public static SocketsHttpHandler CreatePrimaryHandler() => StoreEndpointGuard.CreatePrimaryHandler();

    public async Task<StoreManifest> FetchManifestAsync(string storeUrl, string assetId, string? importToken, CancellationToken cancellationToken)
    {
        var baseValidation = StoreUrlSafety.ValidateStoreBaseUrl(storeUrl);
        if (baseValidation.IsFailure)
            throw new StoreImportException($"{baseValidation.Error.Code}: {baseValidation.Error.Message}");

        var storeUri = new Uri(storeUrl.TrimEnd('/') + "/", UriKind.Absolute);
        var manifestUri = new Uri(storeUri, $"api/assets/{Uri.EscapeDataString(assetId)}/manifest");

        // The manifest fetch opens the job, so it also establishes the origin pin every
        // subsequent same-origin download reuses.
        using var response = await SendPinnedToStoreOriginAsync(
            storeUri,
            () =>
            {
                var request = new HttpRequestMessage(HttpMethod.Get, manifestUri);
                // No token means an anonymous fetch, which the store answers only for an
                // approved free asset. Sending an empty credential instead would be a
                // malformed header, not a weaker one.
                if (!string.IsNullOrWhiteSpace(importToken))
                    request.Headers.Authorization = new AuthenticationHeaderValue(ImportTokenScheme, importToken);
                return request;
            },
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new StoreImportException($"Manifest fetch failed ({(int)response.StatusCode} {response.ReasonPhrase}).");
        }

        // The manifest comes from an untrusted host too - cap it instead of handing the
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
        string storeUrl, string absoluteUrl, string? importToken, long expectedSizeBytes, long? maxBytes, CancellationToken cancellationToken)
    {
        var storeUri = new Uri(storeUrl.TrimEnd('/') + "/", UriKind.Absolute);

        // The store emits relative download URLs when Store:PublicBaseUrl is unset (its
        // StoreUrlProvider falls back to the raw path) - resolve those against the store base
        // the user entered. Absolute http(s) URLs are used as-is.
        //
        // The http(s) scheme test is load-bearing, not decoration: on Unix
        // Uri.TryCreate("/api/files/1", UriKind.Absolute, …) SUCCEEDS and yields
        // file:///api/files/1, so testing "is it absolute?" alone would send every relative
        // URL down the absolute path and fail it as a non-http(s) scheme. An absolute
        // non-http(s) URL still reaches ValidateDownloadTarget below and is refused there.
        if (!Uri.TryCreate(absoluteUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            if (!Uri.TryCreate(storeUri, absoluteUrl, out var resolved))
                throw new StoreImportException($"Download URL is not a valid URL: '{absoluteUrl}'.");
            uri = resolved;
        }

        var client = _httpClientFactory.CreateClient(HttpClientName);
        var maxAllowed = maxBytes is > 0
            ? Math.Min(maxBytes.Value, _absoluteMaxBytes)
            : ComputeMaxAllowedBytes(expectedSizeBytes);

        for (var hop = 0; hop <= _maxRedirects; hop++)
        {
            var pinnedAddress = await ValidateTargetAsync(uri, storeUri, cancellationToken);

            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            // Send the import token ONLY to the store's own ORIGIN (scheme included). A redirect
            // to another origin (e.g. GitHub raw, or a downgrade to http on the same host) is
            // served without it, so the token never leaks cross-origin or in cleartext.
            if (!string.IsNullOrWhiteSpace(importToken) && StoreUrlSafety.IsSameOrigin(uri, storeUri))
                request.Headers.Authorization = new AuthenticationHeaderValue(ImportTokenScheme, importToken);
            if (pinnedAddress is not null)
                request.Options.Set(StoreEndpointGuard.PinnedAddressKey, pinnedAddress);

            HttpResponseMessage sent;
            try
            {
                sent = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            }
            catch (HttpRequestException) when (StoreUrlSafety.IsSameOrigin(uri, storeUri))
            {
                // Same reasoning as the manifest fetch: a dead pinned address must not poison
                // the rest of the TTL.
                _endpoints.InvalidateStoreOriginPin(storeUri);
                throw;
            }

            using var response = sent;

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

    /// <summary>
    /// Sends a request to the store's own origin over the pinned address, invalidating the pin
    /// if the connection fails so the next attempt re-resolves. The caller owns the response.
    /// </summary>
    private async Task<HttpResponseMessage> SendPinnedToStoreOriginAsync(
        Uri storeUri, Func<HttpRequestMessage> requestFactory, CancellationToken cancellationToken)
    {
        var pinned = await _endpoints.GetStoreOriginPinAsync(storeUri, cancellationToken);

        using var request = requestFactory();
        if (pinned is not null)
            request.Options.Set(StoreEndpointGuard.PinnedAddressKey, pinned);

        var client = _httpClientFactory.CreateClient(HttpClientName);
        try
        {
            return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (HttpRequestException)
        {
            // The pinned address may simply have gone away (a store that moved, a rotating
            // A record). Drop it so the next import resolves fresh instead of retrying a dead
            // address for the rest of the TTL.
            _endpoints.InvalidateStoreOriginPin(storeUri);
            throw;
        }
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
    /// SSRF-validates a download/redirect target through the shared guard, translating its
    /// Result into this client's exception contract. Returns the address to pin the
    /// connection to, or null when no pin is needed (an IP-literal target needs no DNS).
    /// </summary>
    private async Task<IPAddress?> ValidateTargetAsync(Uri uri, Uri storeUri, CancellationToken cancellationToken)
    {
        var validated = await _endpoints.ValidateTargetAsync(uri, storeUri, cancellationToken);
        if (validated.IsFailure)
            throw new StoreImportException($"{validated.Error.Code}: {validated.Error.Message}");

        return validated.Value;
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
