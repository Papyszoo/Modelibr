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
