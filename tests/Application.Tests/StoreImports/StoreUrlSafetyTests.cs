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
}
