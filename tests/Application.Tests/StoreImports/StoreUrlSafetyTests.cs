using System.Net;
using Application.StoreImports;
using Xunit;

namespace Application.Tests.StoreImports;

public class StoreUrlSafetyTests
{
    [Theory]
    [InlineData("https://store.example.com")]
    [InlineData("https://store.example.com/")]
    [InlineData("http://localhost:5000")]
    [InlineData("http://127.0.0.1:8080")]
    [InlineData("http://[::1]:8080")]
    public void ValidateStoreBaseUrl_Allows_HttpsOrHttpLoopback(string url)
    {
        Assert.True(StoreUrlSafety.ValidateStoreBaseUrl(url).IsSuccess);
    }

    [Theory]
    [InlineData("http://store.example.com")]     // http against a public host
    [InlineData("http://10.0.0.5")]              // http against a private host
    [InlineData("ftp://store.example.com")]      // non-http(s) scheme
    [InlineData("not-a-url")]
    [InlineData("")]
    public void ValidateStoreBaseUrl_Rejects_InsecureOrInvalid(string url)
    {
        Assert.True(StoreUrlSafety.ValidateStoreBaseUrl(url).IsFailure);
    }

    private static readonly Uri PublicStore = new("https://store.example.com");
    private static readonly Uri LoopbackStore = new("http://127.0.0.1:5000");

    [Fact]
    public void ValidateDownloadTarget_Allows_PublicHttps_ExternalRedirect()
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(
            new Uri("https://raw.githubusercontent.com/org/repo/abc/file.glb"), PublicStore);
        Assert.True(result.IsSuccess);
    }

    [Fact]
    public void ValidateDownloadTarget_Allows_StoresOwnHost_EvenIfPrivate()
    {
        // A self-hosted store may live on a LAN address the user chose; its own host is trusted.
        var lanStore = new Uri("https://192.168.1.5");
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri("https://192.168.1.5/api/files/1/download"), lanStore);
        Assert.True(result.IsSuccess);
    }

    [Theory]
    [InlineData("https://10.0.0.5/f")]
    [InlineData("https://172.16.4.4/f")]
    [InlineData("https://192.168.1.10/f")]
    [InlineData("https://169.254.1.1/f")]     // link-local
    [InlineData("https://192.168.0.99/f")]    // private even over https
    public void ValidateDownloadTarget_Blocks_PrivateAndLinkLocalRedirects(string url)
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri(url), PublicStore);
        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.BlockedDownloadUrl", result.Error.Code);
    }

    // The same targets over plain http are refused one step earlier, as transport downgrades
    // (an https store must never be followed onto http). Both paths block; the codes differ.
    [Theory]
    [InlineData("http://10.0.0.5/f")]
    [InlineData("http://172.16.4.4/f")]
    [InlineData("http://192.168.1.10/f")]
    [InlineData("http://169.254.1.1/f")]
    public void ValidateDownloadTarget_Blocks_HttpRedirects_FromAnHttpsStore(string url)
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri(url), PublicStore);
        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.InsecureDownloadUrl", result.Error.Code);
    }

    [Fact]
    public void ValidateDownloadTarget_Blocks_LoopbackRedirect_ForPublicStore_ButAllowsForLoopbackStore()
    {
        var target = new Uri("http://127.0.0.1:9000/f"); // different port → not same host
        Assert.True(StoreUrlSafety.ValidateDownloadTarget(target, PublicStore).IsFailure);
        Assert.True(StoreUrlSafety.ValidateDownloadTarget(target, LoopbackStore).IsSuccess);
    }

    [Fact]
    public void ValidateDownloadTarget_Blocks_PrivateRedirect_EvenForLoopbackStore()
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri("http://10.0.0.5/f"), LoopbackStore);
        Assert.True(result.IsFailure);
    }

    // Regression: trust used to be host+port only, ignoring the scheme. An https store could
    // redirect a download to http on its own host/port, be treated as "same host", and receive
    // the import token in cleartext (and skip address classification entirely).
    [Fact]
    public void ValidateDownloadTarget_Blocks_HttpsToHttpDowngrade_EvenOnTheStoresOwnHost()
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(
            new Uri("http://store.example.com:443/api/files/1/download"), PublicStore);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.InsecureDownloadUrl", result.Error.Code);
    }

    [Fact]
    public void IsSameOrigin_RequiresSchemeHostAndPort()
    {
        Assert.True(StoreUrlSafety.IsSameOrigin(
            new Uri("https://store.example.com/a"), new Uri("https://STORE.example.com/b")));
        // Same host and port, different scheme - a different principal, so no token.
        Assert.False(StoreUrlSafety.IsSameOrigin(
            new Uri("http://store.example.com:443/a"), new Uri("https://store.example.com/b")));
        Assert.False(StoreUrlSafety.IsSameOrigin(
            new Uri("https://store.example.com:8443/a"), new Uri("https://store.example.com/b")));
    }

    [Theory]
    [InlineData("ftp://host/f")]
    [InlineData("file:///etc/passwd")]
    public void ValidateDownloadTarget_Blocks_NonHttpSchemes(string url)
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri(url), PublicStore);
        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.InsecureDownloadUrl", result.Error.Code);
    }

    [Theory]
    [InlineData("10.0.0.1", false, true)]
    [InlineData("172.31.255.255", false, true)]
    [InlineData("192.168.100.1", false, true)]
    [InlineData("169.254.0.1", false, true)]
    [InlineData("127.0.0.1", false, true)]
    [InlineData("127.0.0.1", true, false)]
    [InlineData("8.8.8.8", false, false)]
    [InlineData("140.82.121.3", false, false)]
    public void IsBlockedAddress_ClassifiesRanges(string ip, bool allowLoopback, bool expectedBlocked)
    {
        Assert.Equal(expectedBlocked, StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback));
    }

    /// <summary>
    /// Every range the classifier used to let through. The old list enumerated "private"
    /// blocks and treated everything else as fair game, so a manifest naming 224.0.0.1 or
    /// 255.255.255.255 got the server to send a request there - a destination the caller had
    /// no other way to reach, which is the whole of what SSRF is.
    /// </summary>
    [Theory]
    // 198.18.0.0/15 - benchmarking
    [InlineData("198.18.0.1")]
    [InlineData("198.19.255.254")]
    // 224.0.0.0/4 - multicast, including the all-hosts group
    [InlineData("224.0.0.1")]
    [InlineData("239.255.255.250")]
    // 240.0.0.0/4 - reserved
    [InlineData("240.0.0.1")]
    [InlineData("255.255.255.254")]
    // The limited broadcast address
    [InlineData("255.255.255.255")]
    // Documentation / protocol-assignment blocks
    [InlineData("192.0.0.1")]
    [InlineData("192.0.2.1")]
    [InlineData("198.51.100.1")]
    [InlineData("203.0.113.1")]
    [InlineData("192.88.99.1")]
    // IPv6 multicast, ff00::/8
    [InlineData("ff00::1")]
    [InlineData("ff02::1")]
    [InlineData("ff05::1:3")]
    // IPv6 documentation and protocol assignments
    [InlineData("2001:db8::1")]
    [InlineData("2001::1")]
    // Wrappers around an IPv4 address that is itself refused - blocking the inner address and
    // not the tunnel would be no blocking at all.
    [InlineData("64:ff9b::a9fe:a9fe")]
    [InlineData("2002:a9fe:a9fe::1")]
    [InlineData("::ffff:169.254.169.254")]
    [InlineData("100::1")]
    public void IsBlockedAddress_Refuses_EveryNonGlobalRange(string ip)
    {
        // allowLoopback: true - the dev-store exception must widen loopback and nothing else.
        Assert.True(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
        Assert.True(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: true));
    }

    /// <summary>
    /// The other half: ordinary global unicast still passes, on both families. A guard that
    /// refuses everything is not a guard, it is an outage.
    /// </summary>
    [Theory]
    [InlineData("1.1.1.1")]
    [InlineData("140.82.121.3")]
    [InlineData("198.20.0.1")]      // just below the benchmarking block
    [InlineData("198.17.255.255")]  // just above it
    [InlineData("223.255.255.255")] // just below multicast
    [InlineData("2606:4700:4700::1111")]
    [InlineData("2a00:1450:4001:80f::200e")]
    [InlineData("2002:8c52:7903::1")] // 6to4 wrapping a public IPv4
    public void IsBlockedAddress_Allows_GlobalUnicast(string ip)
    {
        Assert.False(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
    }

    /// <summary>
    /// Boundary rows for every prefix in the IANA special-purpose registries, IPv6 first.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The classifier was a nest of hand-written byte comparisons, and it had fallen behind
    /// the registry: <c>3fff::/20</c> (documentation, RFC 9637), <c>5f00::/16</c> (SRv6
    /// SIDs, RFC 9602) and <c>2620:4f:8000::/48</c> (the direct AS112 delegation) were all
    /// reachable. Nothing about that form said which entries it was meant to cover, so
    /// nothing said when it stopped covering them.
    /// </para>
    /// <para>
    /// Each row is the FIRST address inside a prefix or the LAST one inside it - the two
    /// places an off-by-one in a mask shows up. The addresses immediately outside each
    /// prefix are the theory below, and the pair is the point: a table that refuses
    /// everything passes the first half on its own.
    /// </para>
    /// </remarks>
    [Theory]
    // 3fff::/20 - documentation (RFC 9637). First and last address in the prefix.
    [InlineData("3fff::")]
    [InlineData("3fff:0fff:ffff:ffff:ffff:ffff:ffff:ffff")]
    // 5f00::/16 - SRv6 SIDs (RFC 9602)
    [InlineData("5f00::")]
    [InlineData("5f00:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    // 2620:4f:8000::/48 - direct delegation AS112 service
    [InlineData("2620:4f:8000::")]
    [InlineData("2620:4f:8000:ffff:ffff:ffff:ffff:ffff")]
    // 2001::/23 - IETF protocol assignments, and the named entries inside it
    [InlineData("2001::")]                  // Teredo
    [InlineData("2001:1::1")]               // Port Control Protocol anycast
    [InlineData("2001:1::2")]               // TURN anycast
    [InlineData("2001:1::3")]               // DNS-SD service registration anycast
    [InlineData("2001:2::1")]               // benchmarking
    [InlineData("2001:3::1")]               // AMT
    [InlineData("2001:4:112::1")]           // AS112-v6
    [InlineData("2001:20::1")]              // ORCHIDv2
    [InlineData("2001:30::1")]              // drone remote-ID entity tags
    [InlineData("2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff")] // last address in /23
    // 2001:db8::/32 - documentation, which sits outside the /23
    [InlineData("2001:db8::")]
    [InlineData("2001:db8:ffff:ffff:ffff:ffff:ffff:ffff")]
    // 100::/64 - discard-only
    [InlineData("100::")]
    [InlineData("100::ffff:ffff:ffff:ffff")]
    // 100:0:0:1::/64 - the RFC 9780 dummy prefix, first and last address. IANA marks it
    // NOT globally reachable; the table omitted it and a test asserted its first address
    // was allowed, which is the finding rather than the behaviour.
    [InlineData("100:0:0:1::")]
    [InlineData("100:0:0:1:ffff:ffff:ffff:ffff")]
    // fc00::/7 - unique-local, both halves
    [InlineData("fc00::")]
    [InlineData("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    // fe80::/10 - link-local unicast
    [InlineData("fe80::")]
    [InlineData("febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    // fec0::/10 - deprecated site-local
    [InlineData("fec0::")]
    [InlineData("feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    // ff00::/8 - multicast
    [InlineData("ff00::")]
    [InlineData("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    // ::/96 - the deprecated IPv4-compatible form and the reserved space around it
    [InlineData("::2")]
    [InlineData("::ffff:ffff")]
    // 64:ff9b::/96 - unwrapped and judged as the IPv4 inside
    [InlineData("64:ff9b::a9fe:a9fe")]
    // 64:ff9b:1::/48 - a DIFFERENT reservation (RFC 8215, local-use), refused whole. Nothing
    // in it is an embedded address, so what the last 32 bits happen to spell is not a reason
    // to let it through - which is what reading the /32 as RFC 6052 syntax used to do.
    [InlineData("64:ff9b:1::c0a8:1")]
    [InlineData("64:ff9b:1::808:808")]
    [InlineData("64:ff9b:1::")]
    [InlineData("64:ff9b:1:ffff:ffff:ffff:ffff:ffff")]
    // One bit past the /96, carrying what would read as a public IPv4 if the prefix were
    // /32. The whole point of the length is that this is not embedded-address syntax.
    [InlineData("64:ff9b:0:0:0:1:8080:8080")]
    // The IPv4 special-purpose rows that had no coverage either
    [InlineData("192.31.196.0")]    // AS112-v4
    [InlineData("192.31.196.255")]
    [InlineData("192.52.193.0")]    // AMT
    [InlineData("192.52.193.255")]
    [InlineData("192.175.48.0")]    // direct delegation AS112 service
    [InlineData("192.175.48.255")]
    [InlineData("100.64.0.0")]      // carrier-grade NAT, first and last
    [InlineData("100.127.255.255")]
    public void IsBlockedAddress_Refuses_EverySpecialPurposePrefix(string ip)
    {
        Assert.True(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
        // The dev-store exception widens loopback and nothing else.
        Assert.True(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: true));
    }

    /// <summary>
    /// Space no registry row names, refused because IANA never delegated it for ordinary use.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The IPv6 Address Space registry delegates exactly one block as Global Unicast -
    /// <c>2000::/3</c> - and marks everything else Reserved by IETF (the special-purpose
    /// entries below <c>2000::</c>, and <c>fc00::/7</c>, <c>fe80::/10</c> and <c>ff00::/8</c>,
    /// are carved out of that reserved space, not out of global unicast). A table of named
    /// prefixes therefore cannot be the whole answer on its own: the addresses BETWEEN the
    /// named rows are not ordinary internet destinations, and letting them through by
    /// omission is the same shape of gap that left <c>3fff::/20</c> reachable.
    /// </para>
    /// <para>
    /// This is what makes the NAT64 length fix safe to make. Narrowing the well-known prefix
    /// from the first four bytes to the RFC 6052 <c>/96</c> means the rest of
    /// <c>64:ff9b::/32</c> stops being read as an embedded IPv4 address - and it must stop
    /// being read as global unicast in the same breath, or the fix would have opened what it
    /// was tightening.
    /// </para>
    /// <para>
    /// Three rows here were previously asserted as ALLOWED, as the addresses just outside
    /// <c>5f00::/16</c> and <c>fc00::/7</c>. That expectation was wrong rather than merely
    /// loose: <c>5eff::</c>, <c>5f01::</c> and <c>fbff::</c> are all outside <c>2000::/3</c>
    /// and none of them is a place a store's download can live.
    /// </para>
    /// </remarks>
    [Theory]
    // Unallocated space under 64:ff9b::/32 that is NOT the RFC 6052 /96 and NOT the RFC 8215
    // /48 - refused as reserved space, and never read as an embedded address.
    [InlineData("64:ff9b:2::808:808")]
    [InlineData("64:ff9b:ffff::808:808")]
    // The rest of ::/8 around the prefixes listed in it.
    [InlineData("::1:0:0")]
    [InlineData("100:0:0:2::")]
    // Either side of 5f00::/16, which IANA allocated out of reserved space.
    [InlineData("5eff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    [InlineData("5f01::")]
    // Just below fc00::/7.
    [InlineData("fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    // The reserved blocks themselves, sampled at their first address.
    [InlineData("4000::1")]
    [InlineData("6000::1")]
    [InlineData("8000::1")]
    [InlineData("c000::1")]
    [InlineData("e000::1")]
    public void IsBlockedAddress_Refuses_SpaceOutsideGlobalUnicast(string ip)
    {
        Assert.True(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
        Assert.True(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: true));
    }

    /// <summary>
    /// The other side of that rule: <c>2000::/3</c> itself is ordinary space, at both ends.
    /// A guard that refuses everything is not a guard.
    /// </summary>
    [Theory]
    [InlineData("2000::1")]
    [InlineData("3fff:ffff:ffff:ffff:ffff:ffff:ffff:fffe")] // last of 2000::/3, outside 3fff::/20
    public void IsBlockedAddress_Allows_TheEndsOfGlobalUnicast(string ip)
    {
        Assert.False(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
    }

    /// <summary>
    /// The address immediately outside each prefix above. This is the half that fails when a
    /// mask is one bit too wide - and refusing real global unicast is an outage, not a
    /// tighter guard.
    /// </summary>
    [Theory]
    // Either side of 3fff::/20
    [InlineData("3ffe:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    [InlineData("3fff:1000::")]
    // Either side of 2620:4f:8000::/48
    [InlineData("2620:4f:7fff:ffff:ffff:ffff:ffff:ffff")]
    [InlineData("2620:4f:8001::")]
    // 2620:4f::/32 is otherwise ordinary space - only the /48 is delegated
    [InlineData("2620:4f::1")]
    // Either side of 2001::/23
    [InlineData("2000:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    [InlineData("2001:200::1")]
    // Either side of 2001:db8::/32
    [InlineData("2001:db7:ffff:ffff:ffff:ffff:ffff:ffff")]
    [InlineData("2001:db9::")]
    // Either side of 2002::/16, which is ordinary space once the tunnel prefix ends
    [InlineData("2001:ffff:ffff:ffff:ffff:ffff:ffff:ffff")]
    [InlineData("2003::1")]
    // NAT64 and 6to4 wrapping a PUBLIC IPv4 stay allowed - the wrapper is not the problem
    [InlineData("64:ff9b::8080:8080")]
    [InlineData("2002:0101:0101::1")]
    // Either side of the IPv4 rows added above
    [InlineData("192.31.195.255")]
    [InlineData("192.31.197.0")]
    [InlineData("192.52.192.255")]
    [InlineData("192.52.194.0")]
    [InlineData("192.175.47.255")]
    [InlineData("192.175.49.0")]
    [InlineData("100.63.255.255")]
    [InlineData("100.128.0.0")]
    public void IsBlockedAddress_Allows_TheAddressesJustOutsideEachPrefix(string ip)
    {
        Assert.False(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
    }

    /// <summary>
    /// The newly covered ranges as a download or redirect-hop target, because that is how a
    /// manifest or a 302 actually delivers one - and the classifier is only useful where it
    /// is consulted.
    /// </summary>
    [Theory]
    [InlineData("https://[3fff::1]/f")]
    [InlineData("https://[5f00::1]/f")]
    [InlineData("https://[2620:4f:8000::1]/f")]
    [InlineData("https://[2001:2::1]/f")]
    [InlineData("https://[fe80::1]/f")]
    [InlineData("https://192.31.196.1/f")]
    [InlineData("https://192.175.48.1/f")]
    [InlineData("https://[64:ff9b:1::]/f")]
    [InlineData("https://[100:0:0:1:ffff:ffff:ffff:ffff]/f")]
    public void ValidateDownloadTarget_Blocks_EveryNewlyCoveredRange(string url)
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri(url), PublicStore);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.BlockedDownloadUrl", result.Error.Code);
    }

    /// <summary>
    /// The same ranges as a download or redirect-hop target, which is how a manifest or a
    /// 302 actually delivers one.
    /// </summary>
    [Theory]
    [InlineData("https://198.18.0.1/f")]
    [InlineData("https://224.0.0.1/f")]
    [InlineData("https://240.0.0.1/f")]
    [InlineData("https://255.255.255.255/f")]
    [InlineData("https://203.0.113.1/f")]
    [InlineData("https://[ff02::1]/f")]
    [InlineData("https://[2001:db8::1]/f")]
    public void ValidateDownloadTarget_Blocks_EveryNonGlobalRange(string url)
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri(url), PublicStore);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.BlockedDownloadUrl", result.Error.Code);
    }

    // ─── translated and tunnelled IPv4, which is IPv4 ─────────────────────────
    //
    // 64:ff9b::/96 (NAT64) and 2002::/16 (6to4) carry an IPv4 address inside them, and the
    // classifier unwraps both. It used to hand the unwrapped bytes to the IPv4 TABLE, which
    // deliberately does not list 127/8 because native loopback was answered one level up -
    // so 64:ff9b::7f00:1 and 2002:7f00:1:: reached the loopback interface of a machine
    // running against a PUBLIC store. The whole IPv4 policy travels with the unwrap now.

    /// <summary>
    /// The reported bypass, both wrappers, at both settings of the developer exception.
    /// </summary>
    [Theory]
    // NAT64 /96 carrying 127.0.0.1
    [InlineData("64:ff9b::7f00:1")]
    // 6to4 carrying 127.0.0.1
    [InlineData("2002:7f00:1::")]
    // and the rest of 127/8, which is loopback just as much as .1 is
    [InlineData("64:ff9b::7f2a:305")]
    [InlineData("2002:7f2a:305::1")]
    public void IsBlockedAddress_Refuses_TranslatedLoopback_ForAPublicStore(string ip)
    {
        Assert.True(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
    }

    /// <summary>
    /// The other half of the same rule: the dev exception is about loopback, so it reaches a
    /// wrapped loopback address too - and nothing else.
    /// </summary>
    [Theory]
    [InlineData("64:ff9b::7f00:1")]
    [InlineData("2002:7f00:1::")]
    public void IsBlockedAddress_Allows_TranslatedLoopback_ForALoopbackStore(string ip)
    {
        Assert.False(StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: true));
    }

    /// <summary>
    /// Every other category through both wrappers, at both settings. Loopback is the ONE row
    /// the exception moves; a private, link-local or documentation address stays refused for
    /// a developer running the store locally, and a public one stays reachable for everybody.
    /// </summary>
    [Theory]
    // wrapper, embedded address, blocked with allowLoopback:false, blocked with allowLoopback:true
    [InlineData("64:ff9b::a00:5", true, true)]          // 10.0.0.5 - private
    [InlineData("2002:a00:5::", true, true)]
    [InlineData("64:ff9b::ac10:404", true, true)]       // 172.16.4.4 - private
    [InlineData("2002:ac10:404::", true, true)]
    [InlineData("64:ff9b::c0a8:1", true, true)]         // 192.168.0.1 - private
    [InlineData("2002:c0a8:1::", true, true)]
    [InlineData("64:ff9b::a9fe:a9fe", true, true)]      // 169.254.169.254 - link-local
    [InlineData("2002:a9fe:a9fe::", true, true)]
    [InlineData("64:ff9b::c000:201", true, true)]       // 192.0.2.1 - TEST-NET-1
    [InlineData("2002:c000:201::", true, true)]
    [InlineData("64:ff9b::e000:1", true, true)]         // 224.0.0.1 - multicast
    [InlineData("2002:e000:1::", true, true)]
    [InlineData("64:ff9b::808:808", false, false)]      // 8.8.8.8 - public
    [InlineData("2002:808:808::", false, false)]
    [InlineData("64:ff9b::8c52:7903", false, false)]    // 140.82.121.3 - public
    [InlineData("2002:8c52:7903::", false, false)]
    public void IsBlockedAddress_Classifies_EveryTranslatedCategory(
        string ip, bool blockedForPublicStore, bool blockedForLoopbackStore)
    {
        Assert.Equal(
            blockedForPublicStore,
            StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: false));
        Assert.Equal(
            blockedForLoopbackStore,
            StoreUrlSafety.IsBlockedAddress(IPAddress.Parse(ip), allowLoopback: true));
    }

    /// <summary>
    /// And through the literal-URL gate, which is where a manifest or a 302 actually delivers
    /// one. A classifier is only worth what the call sites ask it.
    /// </summary>
    [Theory]
    [InlineData("https://[64:ff9b::7f00:1]/f")]
    [InlineData("https://[2002:7f00:1::]/f")]
    [InlineData("https://[64:ff9b:1::808:808]/f")]
    [InlineData("https://[100:0:0:1::1]/f")]
    [InlineData("https://[100:0:0:1::]/f")]
    public void ValidateDownloadTarget_Blocks_TranslatedAndDummyPrefixLiterals(string url)
    {
        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri(url), PublicStore);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.BlockedDownloadUrl", result.Error.Code);
    }

    /// <summary>
    /// A loopback store may follow a redirect to a WRAPPED loopback address - it is the same
    /// machine, reached the long way round - and still may not follow one anywhere else.
    /// </summary>
    [Fact]
    public void ValidateDownloadTarget_FromALoopbackStore_AllowsWrappedLoopback_ButNothingElse()
    {
        var loopbackStore = new Uri("http://localhost:5000");

        Assert.True(StoreUrlSafety
            .ValidateDownloadTarget(new Uri("http://[64:ff9b::7f00:1]/f"), loopbackStore).IsSuccess);
        Assert.True(StoreUrlSafety
            .ValidateDownloadTarget(new Uri("http://[2002:7f00:1::]/f"), loopbackStore).IsSuccess);

        // Same wrapper, a private address inside it. The exception did not widen.
        Assert.True(StoreUrlSafety
            .ValidateDownloadTarget(new Uri("http://[64:ff9b::a00:5]/f"), loopbackStore).IsFailure);
        Assert.True(StoreUrlSafety
            .ValidateDownloadTarget(new Uri("http://[2002:a9fe:a9fe::]/f"), loopbackStore).IsFailure);
    }

    /// <summary>
    /// A loopback store widens loopback and only loopback. Somebody running the store on
    /// their own machine does not thereby consent to it reaching the multicast group.
    /// </summary>
    [Theory]
    [InlineData("http://224.0.0.1/f")]
    [InlineData("http://255.255.255.255/f")]
    [InlineData("http://198.18.0.1/f")]
    [InlineData("http://169.254.169.254/f")]
    public void ValidateDownloadTarget_FromALoopbackStore_StillBlocksNonGlobalRanges(string url)
    {
        var loopbackStore = new Uri("http://localhost:5000");

        var result = StoreUrlSafety.ValidateDownloadTarget(new Uri(url), loopbackStore);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.BlockedDownloadUrl", result.Error.Code);
    }
}
