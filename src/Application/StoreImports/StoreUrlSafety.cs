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

        if (!string.IsNullOrWhiteSpace(uri.UserInfo))
            return Result.Failure(new Error("StoreImport.InvalidStoreUrl", "Store URL must not contain user credentials."));

        if (!string.IsNullOrWhiteSpace(uri.Query))
            return Result.Failure(new Error("StoreImport.InvalidStoreUrl", "Store URL must not contain query parameters."));

        if (!string.IsNullOrWhiteSpace(uri.Fragment))
            return Result.Failure(new Error("StoreImport.InvalidStoreUrl", "Store URL must not contain URL fragments."));

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
    /// same machine. It is answered INSIDE each family's classifier rather than ahead of the
    /// dispatch, because the family classifiers are also what the translation prefixes call:
    /// answering it first meant <c>64:ff9b::7f00:1</c> and <c>2002:7f00:1::</c> unwrapped to
    /// 127.0.0.1 and were handed to a table that deliberately does not list 127/8. A wrapped
    /// loopback address reached a public store's importer; the exception has to travel with
    /// the policy it is an exception to.
    /// </para>
    /// </remarks>
    public static bool IsBlockedAddress(IPAddress ip, bool allowLoopback)
    {
        if (ip.IsIPv4MappedToIPv6)
            ip = ip.MapToIPv4();

        return ip.AddressFamily switch
        {
            AddressFamily.InterNetwork => IsBlockedV4(ip.GetAddressBytes(), allowLoopback),
            AddressFamily.InterNetworkV6 => IsBlockedV6(ip, allowLoopback),
            // Unknown address family - refuse.
            _ => true,
        };
    }

    /// <summary>
    /// The IANA special-purpose registries, as prefix tables.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Written as CIDR data rather than hand-rolled byte comparisons because that is the
    /// shape the source is published in - <c>iana-ipv4-special-registry</c> and
    /// <c>iana-ipv6-special-registry</c> are lists of prefixes, and keeping the same shape
    /// here is what makes "did we miss one" a question somebody can answer by reading two
    /// lists side by side. The hand-rolled form is how <c>3fff::/20</c>, <c>5f00::/16</c>
    /// and <c>2620:4f:8000::/48</c> stayed reachable after IANA added them: nothing about
    /// a nest of byte tests says which entries it is meant to cover.
    /// </para>
    /// <para>
    /// The policy is "special-purpose", not "not globally reachable". A handful of registry
    /// entries are marked globally reachable (the AS112 delegations, AMT, the PCP/TURN/SRP
    /// anycast addresses) and they are refused too: none of them is a place a store's
    /// download lives, and an allow-list with holes in it is how this went wrong the first
    /// time.
    /// </para>
    /// <para>
    /// For IPv6 the table is not the last word either. The IPv6 Address Space registry
    /// delegates <c>2000::/3</c> as Global Unicast and marks the rest Reserved by IETF, so
    /// <see cref="IsBlockedV6"/> ends by refusing anything outside that block. Otherwise the
    /// space BETWEEN the named rows - the unallocated remainder of <c>64:ff9b::/32</c>, say -
    /// would be reachable by omission, which is the same gap that left <c>3fff::/20</c> open
    /// until somebody noticed the registry had grown.
    /// </para>
    /// </remarks>
    private readonly record struct Cidr(byte[] Prefix, int Bits)
    {
        /// <summary>True when <paramref name="address"/> falls inside this prefix.</summary>
        public bool Contains(byte[] address)
        {
            if (address.Length != Prefix.Length)
            {
                return false;
            }

            var wholeBytes = Bits / 8;
            for (var i = 0; i < wholeBytes; i++)
            {
                if (address[i] != Prefix[i])
                {
                    return false;
                }
            }

            var remainder = Bits % 8;
            if (remainder == 0)
            {
                return true;
            }

            var mask = (byte)(0xFF << (8 - remainder));
            return (address[wholeBytes] & mask) == (Prefix[wholeBytes] & mask);
        }
    }

    /// <summary>One registry row, written the way the registry writes it.</summary>
    private static Cidr Range(string prefix, int bits) => new(IPAddress.Parse(prefix).GetAddressBytes(), bits);

    /// <summary>
    /// 127.0.0.0/8 - the one range with an exception, so it is a row of its own rather than
    /// a member of <see cref="BlockedV4"/>: <see cref="IsBlockedV4"/> answers it against
    /// <c>allowLoopback</c> before consulting the table. Being the first test in the IPv4
    /// classifier - rather than a test the caller made before dispatching to it - is what
    /// makes a NAT64- or 6to4-wrapped 127.0.0.1 get the same answer as a bare one.
    /// </summary>
    private static readonly Cidr LoopbackV4 = Range("127.0.0.0", 8);

    /// <summary>::1/128, the IPv6 half of the same exception.</summary>
    private static readonly Cidr LoopbackV6 = Range("::1", 128);

    /// <summary>
    /// IANA IPv4 Special-Purpose Address Registry, plus the multicast and reserved blocks
    /// that live in their own registries. Loopback (127.0.0.0/8) is deliberately absent - it
    /// is the one range with an exception, and <see cref="LoopbackV4"/> above answers it.
    /// </summary>
    private static readonly Cidr[] BlockedV4 =
    [
        Range("0.0.0.0", 8),           // "this network"
        Range("10.0.0.0", 8),          // private
        Range("100.64.0.0", 10),       // carrier-grade NAT
        Range("169.254.0.0", 16),      // link-local, and the cloud metadata endpoint
        Range("172.16.0.0", 12),       // private
        Range("192.0.0.0", 24),        // IETF protocol assignments (incl. DS-Lite, NAT64 well-known)
        Range("192.0.2.0", 24),        // TEST-NET-1 (documentation)
        Range("192.31.196.0", 24),     // AS112-v4
        Range("192.52.193.0", 24),     // AMT
        Range("192.88.99.0", 24),      // deprecated 6to4 relay anycast
        Range("192.168.0.0", 16),      // private
        Range("192.175.48.0", 24),     // direct delegation AS112 service
        Range("198.18.0.0", 15),       // benchmarking
        Range("198.51.100.0", 24),     // TEST-NET-2 (documentation)
        Range("203.0.113.0", 24),      // TEST-NET-3 (documentation)
        Range("224.0.0.0", 4),         // multicast
        Range("240.0.0.0", 4),         // reserved, and 255.255.255.255 (limited broadcast) inside it
    ];

    /// <summary>
    /// IANA IPv6 Special-Purpose Address Registry, plus the multicast block.
    ///
    /// The two prefixes that carry an IPv4 address inside them - <c>64:ff9b::/96</c> and
    /// <c>2002::/16</c> - are NOT here: they are unwrapped in <see cref="IsBlockedV6"/> and
    /// classified as the IPv4 addresses they reach, because an address that is only
    /// reachable through the wrapper is exactly what this refuses. <c>::1/128</c> is absent
    /// for the same reason as 127/8 above.
    /// </summary>
    private static readonly Cidr[] BlockedV6 =
    [
        Range("::", 128),              // unspecified
        Range("::", 96),               // deprecated IPv4-compatible, and the reserved space around it
        Range("::ffff:0:0", 96),       // IPv4-mapped (the caller unwraps these; listed so the table is the whole registry)
        Range("64:ff9b:1::", 48),      // IPv4/IPv6 translation, LOCAL-USE (RFC 8215) - see IsBlockedV6
        Range("100::", 64),            // discard-only
        Range("100:0:0:1::", 64),      // dummy IPv6 prefix (RFC 9780), not globally reachable
        Range("2001::", 23),           // IETF protocol assignments: Teredo, benchmarking, AMT, AS112-v6, ORCHIDv2, DETs
        Range("2001:db8::", 32),       // documentation
        Range("2620:4f:8000::", 48),   // direct delegation AS112 service
        Range("3fff::", 20),           // documentation (RFC 9637)
        Range("5f00::", 16),           // SRv6 SIDs (RFC 9602)
        Range("fc00::", 7),            // unique-local
        Range("fe80::", 10),           // link-local unicast
        Range("fec0::", 10),           // deprecated site-local
        Range("ff00::", 8),            // multicast
    ];

    /// <summary>
    /// RFC 6052's Well-Known Prefix, at the length RFC 6052 actually gives it.
    /// </summary>
    /// <remarks>
    /// The /96 is the only length at which the last 32 bits are an embedded IPv4 address.
    /// Matching on the first four bytes instead treated all of <c>64:ff9b::/32</c> as
    /// embedded-address syntax, which is wrong in both directions: it read the tail of
    /// <c>64:ff9b:1::/48</c> - a distinct, non-globally-reachable RFC 8215 reservation with
    /// no defined embedded address - as an IPv4 address and let <c>64:ff9b:1::808:808</c>
    /// through on the strength of 8.8.8.8 being public, and it would have called unallocated
    /// space elsewhere under the /32 NAT64 too. The /48 is now an ordinary row in
    /// <see cref="BlockedV6"/>, refused whole and without pretending to read an address out
    /// of it.
    /// </remarks>
    private static readonly Cidr Nat64WellKnown = Range("64:ff9b::", 96);

    /// <summary>2002::/16 - 6to4, which embeds the IPv4 address it tunnels to in bytes 2-5.</summary>
    private static readonly Cidr SixToFour = Range("2002::", 16);

    /// <summary>
    /// 2000::/3 - the only part of the IPv6 address space IANA has delegated as Global
    /// Unicast. Everything outside it is "Reserved by IETF" in the IPv6 Address Space
    /// registry, so nothing a store's download can legitimately live at, and refusing it is
    /// what keeps the answer fail-closed for space no registry row names yet - including the
    /// unallocated remainder of <c>64:ff9b::/32</c>.
    /// </summary>
    private static readonly Cidr GlobalUnicastV6 = Range("2000::", 3);

    /// <summary>
    /// The IPv4 half, including the loopback exception. Every caller reaches the policy
    /// through here - the bare IPv4 dispatch and both translation prefixes alike - so there
    /// is one answer for 127.0.0.1 rather than one per route to it.
    /// </summary>
    private static bool IsBlockedV4(byte[] address, bool allowLoopback)
    {
        if (LoopbackV4.Contains(address))
            return !allowLoopback;

        return BlockedV4.Any(range => range.Contains(address));
    }

    /// <summary>
    /// The IPv6 half. Two prefixes carry an IPv4 address inside them, and an address that is
    /// only reachable because of the wrapper is exactly what this is here to refuse - so they
    /// are unwrapped and classified as the IPv4 addresses they are, <b>by the full IPv4
    /// policy</b>: the loopback row and the developer exception included.
    /// </summary>
    private static bool IsBlockedV6(IPAddress ip, bool allowLoopback)
    {
        var b = ip.GetAddressBytes();

        if (LoopbackV6.Contains(b))
            return !allowLoopback;

        // 64:ff9b::/96 - and only the /96. The last four bytes are an IPv4 address, and
        // reaching 169.254.169.254 (or 127.0.0.1) through a translator is still reaching it.
        if (Nat64WellKnown.Contains(b))
            return IsBlockedV4(b[12..16], allowLoopback);

        if (SixToFour.Contains(b))
            return IsBlockedV4(b[2..6], allowLoopback);

        if (BlockedV6.Any(range => range.Contains(b)))
            return true;

        // Nothing named it, so the question is whether IANA has delegated it for ordinary
        // global use at all. Reserved space is refused rather than allowed by omission.
        return !GlobalUnicastV6.Contains(b);
    }
}
