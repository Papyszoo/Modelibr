using System.Net;
using System.Net.Sockets;
using Application.StoreImports;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Infrastructure.Services;

/// <summary>
/// The outbound-request half of the store SSRF defence, shared by every client that talks to
/// a store.
///
/// <para>
/// <see cref="StoreUrlSafety"/> classifies a URL; this classifies the <b>address behind</b>
/// it and then makes sure that is the address actually dialled. Those are two different
/// jobs and only the first can be done without I/O, which is why they live apart - but a
/// client that does only the first is not protected: <c>evil.example</c> passes every URL
/// check ever written and resolves to 127.0.0.1.
/// </para>
///
/// <para>
/// Pinning closes the second half. Validating a hostname's addresses and then handing the
/// hostname to the socket leaves a window in which a 0-TTL record answers differently -
/// classic DNS rebinding. The validated address travels on the request as
/// <see cref="PinnedAddressKey"/> and <see cref="CreatePrimaryHandler"/>'s ConnectCallback
/// dials it directly; TLS and SNI still use the URI host, so certificate validation is
/// unaffected.
/// </para>
///
/// <para>
/// Extracted from <see cref="StoreImportClient"/>, which had all of this and was the only
/// client that did. The catalog client validated the URL it typed and let the handler
/// resolve and connect on its own, so a public store could steer a catalog read at loopback
/// with a hostname or a redirect. One copy is the only way both stay fixed.
/// </para>
/// </summary>
internal sealed class StoreEndpointGuard
{
    /// <summary>
    /// Per-request option carrying the address that passed SSRF validation. The primary
    /// handler's ConnectCallback dials THIS address (TLS/SNI still use the URI host), so a
    /// hostname cannot re-resolve to a private range between validation and connection.
    /// </summary>
    public static readonly HttpRequestOptionsKey<IPAddress> PinnedAddressKey =
        new("Modelibr.Store.PinnedAddress");

    /// <summary>
    /// How long a resolved store-origin address stays pinned. Long enough that one job
    /// (a manifest plus every file, or a page of catalog reads) uses ONE address, short
    /// enough that a store which legitimately moves is picked up on the next one.
    /// </summary>
    private static readonly TimeSpan StoreOriginPinTtl = TimeSpan.FromMinutes(5);

    private readonly ILogger _logger;

    /// <summary>
    /// Resolved address per store origin. The store's own origin is trusted (it may be a LAN
    /// or loopback address the user chose), so this is NOT a block-list check - it exists so
    /// every request in one job lands on the SAME host. Without it, the origin is re-resolved
    /// per request and a 0-TTL record can move two requests of one job to different machines.
    /// </summary>
    private readonly Dictionary<string, (IPAddress Address, DateTimeOffset ExpiresAt)> _storeOriginPins = new();
    private readonly SemaphoreSlim _pinLock = new(1, 1);

    /// <summary>Test seam for host lookups, so the guard is testable without any network I/O.</summary>
    internal Func<string, CancellationToken, Task<IPAddress[]>> ResolveHostAsync { get; set; }
        = (host, ct) => Dns.GetHostAddressesAsync(host, ct);

    public StoreEndpointGuard(ILogger logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Primary handler for a store-facing named client: manual redirects (auto-redirect would
    /// bypass the per-hop SSRF validation entirely, taking a hop the gate never saw) and a
    /// ConnectCallback honoring <see cref="PinnedAddressKey"/>.
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

    /// <summary>
    /// SSRF-validates one request or redirect hop and returns the address to dial, or null
    /// when there is nothing to pin (an IP literal needs no DNS; a store-origin lookup that
    /// did not answer falls back to the handler's own resolution).
    /// </summary>
    /// <remarks>
    /// Every hop goes through this, the first included. A redirect chain is a sequence of
    /// destinations the store chose, and only the one the caller typed was ever checked
    /// by anything upstream.
    /// </remarks>
    public async Task<Result<IPAddress?>> ValidateTargetAsync(
        Uri target, Uri storeUri, CancellationToken cancellationToken)
    {
        var targetCheck = StoreUrlSafety.ValidateDownloadTarget(target, storeUri);
        if (targetCheck.IsFailure)
            return Result.Failure<IPAddress?>(targetCheck.Error);

        // The store's own origin is trusted (it may be a chosen LAN/loopback address), so its
        // address is never block-listed - but it IS pinned, so every request in this job
        // reaches the same host as the first one did.
        if (StoreUrlSafety.IsSameOrigin(target, storeUri))
            return Result.Success(await GetStoreOriginPinAsync(storeUri, cancellationToken));

        // IP literals were classified by ValidateDownloadTarget and need no DNS (or pin).
        if (IPAddress.TryParse(target.Host, out _))
            return Result.Success<IPAddress?>(null);

        IPAddress[] addresses;
        try
        {
            addresses = await ResolveHostAsync(target.Host, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Result.Failure<IPAddress?>(new Error(
                "StoreImport.UnresolvableDownloadUrl",
                $"Could not resolve host '{target.Host}': {ex.Message}"));
        }

        if (addresses.Length == 0)
            return Result.Failure<IPAddress?>(new Error(
                "StoreImport.UnresolvableDownloadUrl",
                $"Host '{target.Host}' did not resolve to any address."));

        // Not the store's own host (returned early above), so loopback is only tolerated when
        // the store itself is loopback (the documented dev exception); private, link-local,
        // unique-local and other non-routable ranges are always blocked.
        //
        // EVERY address is checked, not just the one that gets pinned: a host answering with
        // one public and one private address must not be reachable by retrying.
        var allowLoopback = StoreUrlSafety.IsLoopbackHost(storeUri);
        foreach (var address in addresses)
        {
            if (StoreUrlSafety.IsBlockedAddress(address, allowLoopback))
                return Result.Failure<IPAddress?>(new Error(
                    "StoreImport.BlockedDownloadUrl",
                    $"Refusing to reach '{target.Host}' - it resolves to a private or loopback address."));
        }

        return Result.Success<IPAddress?>(addresses[0]);
    }

    /// <summary>
    /// The address to dial for the store's own origin, or null when there is nothing to pin
    /// (an IP-literal host, or a lookup that did not answer).
    /// </summary>
    /// <remarks>
    /// Pinning the store origin is HARDENING, never a gate: it must not turn into a new way
    /// for a store request to fail. A lookup that fails here returns null and the request
    /// proceeds with the handler's own resolution - the same behavior as before the pin
    /// existed - and the real connection error surfaces from the send instead of a
    /// misleading DNS message. It is deliberately not block-list checked; a self-hosted
    /// store is allowed to live on a LAN or loopback address the user chose.
    /// </remarks>
    public async Task<IPAddress?> GetStoreOriginPinAsync(Uri storeUri, CancellationToken cancellationToken)
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
                _logger.LogDebug(ex, "Store request: could not resolve store host '{Host}' to pin it", storeUri.Host);
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

    /// <summary>
    /// Drops a pin whose address stopped answering, so the next request re-resolves instead
    /// of retrying a dead address for the rest of the TTL.
    /// </summary>
    public void InvalidateStoreOriginPin(Uri storeUri)
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
}
