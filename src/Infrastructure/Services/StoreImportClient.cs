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

    /// <summary>
    /// Per-request option carrying the address that passed SSRF validation. The primary
    /// handler's ConnectCallback dials THIS address (TLS/SNI still use the URI host), so a
    /// hostname cannot re-resolve to a private range between validation and connection.
    /// </summary>
    private static readonly HttpRequestOptionsKey<IPAddress> PinnedAddressKey = new("Modelibr.StoreImport.PinnedAddress");

    /// <summary>
    /// How long a resolved store-origin address stays pinned. Long enough that one import job
    /// (manifest + every file) uses ONE address, short enough that a store which legitimately
    /// moves is picked up on the next import.
    /// </summary>
    private static readonly TimeSpan StoreOriginPinTtl = TimeSpan.FromMinutes(5);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<StoreImportClient> _logger;
    private readonly int _maxRedirects;
    private readonly long _absoluteMaxBytes;
    private readonly long _maxManifestBytes;

    /// <summary>
    /// Resolved address per store origin. The store's own origin is trusted (it may be a LAN or
    /// loopback address the user chose), so this is NOT a block-list check - it exists so every
    /// token-bearing request in one import lands on the SAME host. Without it, the origin is
    /// re-resolved per request and a 0-TTL record can move the manifest fetch and the file
    /// downloads to different machines mid-job.
    /// </summary>
    private readonly Dictionary<string, (IPAddress Address, DateTimeOffset ExpiresAt)> _storeOriginPins = new();
    private readonly SemaphoreSlim _pinLock = new(1, 1);

    /// <summary>
    /// Test seam for the pin's host lookup. Not a constructor parameter: the DI container has
    /// no registration for it and would fail to pick the constructor.
    /// </summary>
    internal Func<string, CancellationToken, Task<IPAddress[]>> ResolveHostAsync { get; set; }
        = (host, ct) => Dns.GetHostAddressesAsync(host, ct);

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
                request.Options.Set(PinnedAddressKey, pinnedAddress);

            HttpResponseMessage sent;
            try
            {
                sent = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            }
            catch (HttpRequestException) when (StoreUrlSafety.IsSameOrigin(uri, storeUri))
            {
                // Same reasoning as the manifest fetch: a dead pinned address must not poison
                // the rest of the TTL.
                InvalidateStoreOriginPin(storeUri);
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
        var pinned = await GetStoreOriginPinAsync(storeUri, cancellationToken);

        using var request = requestFactory();
        if (pinned is not null)
            request.Options.Set(PinnedAddressKey, pinned);

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
            InvalidateStoreOriginPin(storeUri);
            throw;
        }
    }

    /// <summary>
    /// The address to dial for the store's own origin, or null when there is nothing to pin (an
    /// IP-literal host, or a lookup that did not answer). Cached for
    /// <see cref="StoreOriginPinTtl"/> so one import job is consistent; deliberately NOT
    /// block-list checked - a self-hosted store is allowed to live on a LAN or loopback address.
    ///
    /// Pinning the store origin is HARDENING, never a gate: it must not turn into a new way for
    /// an import to fail. A lookup that fails here returns null and the request proceeds with
    /// the handler's own resolution - the same behavior as before the pin existed - and the real
    /// connection error surfaces from the send instead of a misleading DNS message.
    /// </summary>
    private async Task<IPAddress?> GetStoreOriginPinAsync(Uri storeUri, CancellationToken cancellationToken)
    {
        if (IPAddress.TryParse(storeUri.Host, out _))
            return null;

        var key = StoreOriginKey(storeUri);

        await _pinLock.WaitAsync(cancellationToken);
        try
        {
            if (_storeOriginPins.TryGetValue(key, out var cached) && cached.ExpiresAt > DateTimeOffset.UtcNow)
                return cached.Address;

            IPAddress[] addresses;
            try
            {
                addresses = await ResolveHostAsync(storeUri.Host, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogDebug(ex, "Store import: could not resolve store host '{Host}' to pin it", storeUri.Host);
                return null;
            }

            if (addresses.Length == 0)
                return null;

            var address = addresses[0];
            _storeOriginPins[key] = (address, DateTimeOffset.UtcNow.Add(StoreOriginPinTtl));
            return address;
        }
        finally
        {
            _pinLock.Release();
        }
    }

    private void InvalidateStoreOriginPin(Uri storeUri)
    {
        _pinLock.Wait();
        try
        {
            _storeOriginPins.Remove(StoreOriginKey(storeUri));
        }
        finally
        {
            _pinLock.Release();
        }
    }

    private static string StoreOriginKey(Uri storeUri)
        => $"{storeUri.Scheme}://{storeUri.Host.ToLowerInvariant()}:{storeUri.Port}";

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

        // The store's own origin is trusted (may be a chosen LAN/loopback address), so its
        // address is never block-listed - but it IS pinned, so every token-bearing request in
        // this import reaches the same host as the manifest did.
        if (StoreUrlSafety.IsSameOrigin(uri, storeUri))
            return await GetStoreOriginPinAsync(storeUri, cancellationToken);

        // IP literals were classified in ValidateDownloadTarget and need no DNS (or pin).
        if (IPAddress.TryParse(uri.Host, out _))
            return null;

        // Resolve hostnames and validate the resolved addresses so a hostname that points at
        // a private/loopback range is blocked too. The first safe address is pinned for the
        // connection itself - otherwise a 0-TTL DNS record could pass validation here and
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
                throw new StoreImportException($"Refusing to download from '{uri.Host}' - it resolves to a private/loopback address.");
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
