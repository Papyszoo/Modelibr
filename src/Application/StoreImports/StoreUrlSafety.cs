using System.Net;
using System.Net.Sockets;
using SharedKernel;

namespace Application.StoreImports;

/// <summary>
/// SSRF guards for the store importer. <c>storeUrl</c> and the manifest's download URLs are
/// user-influenced, so the backend must treat them as untrusted: require https (allow http
/// only for loopback dev), and never let a download or a redirect hop reach a private/
/// link-local/loopback address (except the dev-localhost case). The IP classification lives
/// here so it is unit-testable without any network I/O.
/// </summary>
public static class StoreUrlSafety
{
    /// <summary>
    /// Validates the user-supplied store base URL. https is required; http is allowed only
    /// when the host is loopback/localhost (developer running the store locally).
    /// </summary>
    public static Result ValidateStoreBaseUrl(string? storeUrl)
    {
        if (string.IsNullOrWhiteSpace(storeUrl))
            return Result.Failure(new Error("StoreImport.InvalidStoreUrl", "Store URL is required."));

        if (!Uri.TryCreate(storeUrl, UriKind.Absolute, out var uri))
            return Result.Failure(new Error("StoreImport.InvalidStoreUrl", "Store URL must be a valid absolute URL."));

        if (uri.Scheme == Uri.UriSchemeHttps)
            return Result.Success();

        if (uri.Scheme == Uri.UriSchemeHttp && IsLoopbackHost(uri))
            return Result.Success();

        return Result.Failure(new Error(
            "StoreImport.InsecureStoreUrl",
            "Store URL must use https (http is only allowed for localhost)."));
    }

    /// <summary>True when the store base URL points at loopback, enabling the dev-localhost exception.</summary>
    public static bool IsLoopbackHost(Uri uri)
    {
        if (uri.IsLoopback)
            return true;

        // Uri.IsLoopback already covers "localhost", 127.0.0.0/8 and ::1, but be explicit
        // about the literal for readability and in case of unusual host casing.
        if (string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase))
            return true;

        return IPAddress.TryParse(uri.Host, out var ip) && IPAddress.IsLoopback(ip);
    }

    /// <summary>
    /// True when two URLs share a full origin - scheme, host (case-insensitive) and port.
    /// Trust is deliberately origin-based, not host-based: <c>http://store:443</c> is NOT the
    /// same principal as <c>https://store:443</c>, so an https store that redirects to plain
    /// http on its own host must not be handed the import token in cleartext.
    /// </summary>
    public static bool IsSameOrigin(Uri a, Uri b)
        => string.Equals(a.Scheme, b.Scheme, StringComparison.OrdinalIgnoreCase)
           && string.Equals(a.Host, b.Host, StringComparison.OrdinalIgnoreCase)
           && a.Port == b.Port;

    /// <summary>
    /// Validates a download / redirect-hop target against the store it belongs to. The scheme
    /// must stay http(s) (blocks downgrades to file://, gopher://, etc.) and an https store may
    /// never be downgraded to http on any hop. The store's OWN origin is trusted (a self-hosted
    /// store may legitimately live on a LAN/loopback address that the user chose), so
    /// same-origin targets always pass. Any OTHER origin must not be a private/link-local
    /// address - and not loopback either, unless the store itself is loopback (dev). When the
    /// target host is an IP literal it is classified here; hostnames pass this check and the
    /// client additionally resolves + re-validates them via <see cref="IsBlockedAddress"/>.
    /// </summary>
    public static Result ValidateDownloadTarget(Uri target, Uri storeUri)
    {
        if (target.Scheme != Uri.UriSchemeHttps && target.Scheme != Uri.UriSchemeHttp)
            return Result.Failure(new Error(
                "StoreImport.InsecureDownloadUrl",
                $"Refusing to download from a non-http(s) URL ({target.Scheme})."));

        // A transport downgrade is refused before anything else - otherwise an https store
        // could redirect to http on its own host/port and read the import token off the wire.
        if (storeUri.Scheme == Uri.UriSchemeHttps && target.Scheme == Uri.UriSchemeHttp)
            return Result.Failure(new Error(
                "StoreImport.InsecureDownloadUrl",
                $"Refusing to downgrade to http for '{target.Host}' - the store is https."));

        // The store's own origin is trusted (it is the URL the user entered).
        if (IsSameOrigin(target, storeUri))
            return Result.Success();

        var allowLoopback = IsLoopbackHost(storeUri);
        if (IPAddress.TryParse(target.Host, out var ip) && IsBlockedAddress(ip, allowLoopback))
            return Result.Failure(new Error(
                "StoreImport.BlockedDownloadUrl",
                $"Refusing to download from a private or loopback address ({target.Host})."));

        return Result.Success();
    }

    /// <summary>
    /// Classifies an IP as unsafe for outbound importer requests: loopback (unless allowed),
    /// private (RFC1918 / unique-local), link-local, or otherwise non-routable.
    /// </summary>
    public static bool IsBlockedAddress(IPAddress ip, bool allowLoopback)
    {
        if (ip.IsIPv4MappedToIPv6)
            ip = ip.MapToIPv4();

        if (IPAddress.IsLoopback(ip))
            return !allowLoopback;

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = ip.GetAddressBytes();
            // 10.0.0.0/8
            if (bytes[0] == 10) return true;
            // 172.16.0.0/12
            if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
            // 192.168.0.0/16
            if (bytes[0] == 192 && bytes[1] == 168) return true;
            // 169.254.0.0/16 (link-local)
            if (bytes[0] == 169 && bytes[1] == 254) return true;
            // 100.64.0.0/10 (carrier-grade NAT)
            if (bytes[0] == 100 && bytes[1] >= 64 && bytes[1] <= 127) return true;
            // 0.0.0.0/8 (this host / unspecified)
            if (bytes[0] == 0) return true;
            return false;
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal) return true;
            var bytes = ip.GetAddressBytes();
            // fc00::/7 unique-local
            if ((bytes[0] & 0xFE) == 0xFC) return true;
            // :: unspecified
            if (IPAddress.IPv6Any.Equals(ip)) return true;
            return false;
        }

        // Unknown address family - refuse.
        return true;
    }
}
