using System.Net;
using System.Net.Sockets;
using SharedKernel;

namespace Application.StoreImports;

/// <summary>
/// SSRF guards for the store importer. <c>storeUrl</c> and the manifest's download URLs are
/// user-influenced, so the backend must treat them as untrusted: require https (allow http
/// only for loopback dev), and never let a download or a redirect hop reach anything but a
/// global unicast address (except the dev-localhost case).
///
/// "Not private" is not the test - "global" is. Refusing only RFC1918 and loopback left the
/// benchmarking, multicast, reserved and documentation blocks open, and a request the server
/// makes to 224.0.0.1 or 255.255.255.255 is still a request the caller could not have made.
/// The IP classification lives here so it is unit-testable without any network I/O.
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
                $"Refusing to download from a non-global address ({target.Host})."));

        return Result.Success();
    }

    /// <summary>
    /// True when <paramref name="ip"/> is <b>not</b> a global unicast destination this
    /// importer may reach.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The rule is an allow-list in disguise: everything IANA marks special-purpose is
    /// refused, and only ordinary global unicast is left. Enumerating "private" ranges the
    /// other way around is how this was written first, and it let through benchmarking
    /// space, the whole multicast block, reserved 240/4, the limited broadcast address and
    /// every IPv6 multicast group - each of which is a way to make the server send a request
    /// somewhere the caller could not otherwise reach.
    /// </para>
    /// <para>
    /// Loopback is the single exception, and only when <paramref name="allowLoopback"/> says
    /// the store itself is loopback - the documented developer case of a store running on the
    /// same machine.
    /// </para>
    /// </remarks>
    public static bool IsBlockedAddress(IPAddress ip, bool allowLoopback)
    {
        if (ip.IsIPv4MappedToIPv6)
            ip = ip.MapToIPv4();

        if (IPAddress.IsLoopback(ip))
            return !allowLoopback;

        return ip.AddressFamily switch
        {
            AddressFamily.InterNetwork => IsBlockedV4(ip.GetAddressBytes()),
            AddressFamily.InterNetworkV6 => IsBlockedV6(ip),
            // Unknown address family - refuse.
            _ => true,
        };
    }

    /// <summary>
    /// Every IPv4 block IANA lists as special-purpose. Loopback (127/8) is handled by the
    /// caller, because it is the one range with an exception.
    /// </summary>
    private static bool IsBlockedV4(byte[] b) =>
        // 0.0.0.0/8 - "this network"
        b[0] == 0 ||
        // 10.0.0.0/8 - private
        b[0] == 10 ||
        // 100.64.0.0/10 - carrier-grade NAT
        (b[0] == 100 && b[1] >= 64 && b[1] <= 127) ||
        // 169.254.0.0/16 - link-local, and the cloud metadata endpoint
        (b[0] == 169 && b[1] == 254) ||
        // 172.16.0.0/12 - private
        (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
        // 192.0.0.0/24 - IETF protocol assignments
        (b[0] == 192 && b[1] == 0 && b[2] == 0) ||
        // 192.0.2.0/24 - TEST-NET-1 (documentation)
        (b[0] == 192 && b[1] == 0 && b[2] == 2) ||
        // 192.88.99.0/24 - deprecated 6to4 relay anycast
        (b[0] == 192 && b[1] == 88 && b[2] == 99) ||
        // 192.168.0.0/16 - private
        (b[0] == 192 && b[1] == 168) ||
        // 198.18.0.0/15 - benchmarking
        (b[0] == 198 && (b[1] == 18 || b[1] == 19)) ||
        // 198.51.100.0/24 - TEST-NET-2 (documentation)
        (b[0] == 198 && b[1] == 51 && b[2] == 100) ||
        // 203.0.113.0/24 - TEST-NET-3 (documentation)
        (b[0] == 203 && b[1] == 0 && b[2] == 113) ||
        // 224.0.0.0/4 - multicast
        (b[0] >= 224 && b[0] <= 239) ||
        // 240.0.0.0/4 - reserved, and 255.255.255.255 (limited broadcast) inside it
        b[0] >= 240;

    /// <summary>
    /// The IPv6 half. Two of these carry an IPv4 address inside them, and an address that is
    /// only reachable because of the wrapper is exactly what this is here to refuse - so they
    /// are unwrapped and classified as the IPv4 addresses they are.
    /// </summary>
    private static bool IsBlockedV6(IPAddress ip)
    {
        if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast)
            return true;

        var b = ip.GetAddressBytes();

        // ff00::/8 - multicast. IsIPv6Multicast already says so; stated because this list is
        // read as the definition of what is refused.
        if (b[0] == 0xFF) return true;

        // fc00::/7 - unique-local
        if ((b[0] & 0xFE) == 0xFC) return true;

        // :: - unspecified
        if (IPAddress.IPv6Any.Equals(ip)) return true;

        // 64:ff9b::/96 and 64:ff9b:1::/48 - NAT64. The last four bytes are an IPv4 address,
        // and reaching 169.254.169.254 through a translator is still reaching it.
        if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xFF && b[3] == 0x9B)
            return IsBlockedV4(b[12..16]);

        // 100::/64 - discard-only
        if (b[0] == 0x01 && b[1] == 0x00 && b[2..8].All(x => x == 0)) return true;

        // 2001::/23 - IETF protocol assignments, which includes Teredo (2001::/32) and the
        // 2001:db8::/32 documentation block.
        if (b[0] == 0x20 && b[1] == 0x01 && (b[2] & 0xFE) == 0x00) return true;
        if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0D && b[3] == 0xB8) return true;

        // 2002::/16 - 6to4, which embeds the IPv4 address it tunnels to in the next 4 bytes.
        if (b[0] == 0x20 && b[1] == 0x02)
            return IsBlockedV4(b[2..6]);

        // ::/96 - the deprecated IPv4-compatible form and the reserved space around it. ::1
        // never reaches here (the caller answers loopback first), so nothing in this block is
        // a destination worth keeping.
        if (b[0..12].All(x => x == 0)) return true;

        return false;
    }
}
