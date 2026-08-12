using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Application.StoreImports;
using Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// Covers StoreImportClient — the SSRF-hardened server-to-server client that pulls a
/// store manifest and its files. StoreUrlSafety unit-tests the POLICY; these tests cover
/// the client that APPLIES it: which hops carry the import token, redirect handling and
/// the hop cap, size caps, and relative download-URL resolution.
///
/// The connection pinning (SocketsHttpHandler.ConnectCallback) is deliberately NOT covered
/// here — it needs real sockets. It is exercised by the e2e store-fixture import instead.
/// </summary>
public class StoreImportClientTests
{
    private const string StoreUrl = "https://store.example.com";
    private const string Token = "import-token-value";

    /// <summary>Serves canned responses and records every outbound request for assertions.</summary>
    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _respond;
        public List<HttpRequestMessage> Requests { get; } = new();

        public RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) => _respond = respond;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(_respond(request));
        }
    }

    private static (StoreImportClient Client, RecordingHandler Handler) Build(
        Func<HttpRequestMessage, HttpResponseMessage> respond)
    {
        var handler = new RecordingHandler(respond);
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(StoreImportClient.HttpClientName))
            .Returns(() => new HttpClient(handler, disposeHandler: false));

        var configuration = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var client = new StoreImportClient(factory.Object, configuration, NullLogger<StoreImportClient>.Instance);
        return (client, handler);
    }

    private static HttpResponseMessage Content(string body, string contentType = "application/json")
        => new(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, contentType)
        };

    private static HttpResponseMessage Bytes(byte[] payload)
        => new(HttpStatusCode.OK) { Content = new ByteArrayContent(payload) };

    private static HttpResponseMessage RedirectTo(string location)
    {
        var response = new HttpResponseMessage(HttpStatusCode.Found);
        response.Headers.Location = new Uri(location);
        return response;
    }

    // ---- manifest --------------------------------------------------------

    [Fact]
    public async Task FetchManifest_SendsImportTokenScheme_ToTheStore()
    {
        var (client, handler) = Build(_ => Content("""{"schemaVersion":1,"title":"Pack"}"""));

        var manifest = await client.FetchManifestAsync(StoreUrl, "asset-1", Token, CancellationToken.None);

        Assert.Equal(1, manifest.SchemaVersion);
        var request = Assert.Single(handler.Requests);
        Assert.Equal($"{StoreUrl}/api/assets/asset-1/manifest", request.RequestUri!.ToString());
        // Contract with the store: the scheme is "ImportToken", not "Bearer".
        Assert.Equal("ImportToken", request.Headers.Authorization!.Scheme);
        Assert.Equal(Token, request.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task FetchManifest_RejectsAnInsecureStoreUrl()
    {
        var (client, _) = Build(_ => Content("{}"));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() =>
            client.FetchManifestAsync("http://store.example.com", "asset-1", Token, CancellationToken.None));

        Assert.Contains("InsecureStoreUrl", ex.Message);
    }

    [Fact]
    public async Task FetchManifest_FailsOnNonSuccessStatus()
    {
        var (client, _) = Build(_ => new HttpResponseMessage(HttpStatusCode.Forbidden));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() =>
            client.FetchManifestAsync(StoreUrl, "asset-1", Token, CancellationToken.None));

        Assert.Contains("403", ex.Message);
    }

    // ---- downloads -------------------------------------------------------

    [Fact]
    public async Task Download_SendsTheTokenToTheStoresOwnOrigin()
    {
        var payload = new byte[] { 1, 2, 3, 4 };
        var (client, handler) = Build(_ => Bytes(payload));

        using var file = await client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/api/files/1/download", Token, payload.Length, null, CancellationToken.None);

        Assert.Equal(payload.Length, file.Length);
        Assert.Equal("ImportToken", Assert.Single(handler.Requests).Headers.Authorization!.Scheme);
    }

    // Regression (PR 578 review): trust used to be host+port only. An https store that
    // redirects to http on its own host/port was treated as "same host" and handed the
    // token in cleartext. Trust is now same-ORIGIN and a downgrade is refused outright.
    [Fact]
    public async Task Download_RefusesAnHttpsToHttpDowngrade_EvenOnTheStoresOwnHost()
    {
        var (client, _) = Build(_ => RedirectTo("http://store.example.com:443/api/files/1/download"));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() => client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/api/files/1/download", Token, 4, null, CancellationToken.None));

        Assert.Contains("InsecureDownloadUrl", ex.Message);
    }

    // Regression: external-tier files 302 to GitHub raw. The token must NOT ride along.
    [Fact]
    public async Task Download_DropsTheTokenOnACrossOriginRedirect()
    {
        var payload = new byte[] { 9, 9, 9 };
        var (client, handler) = Build(request =>
            request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://raw.githubusercontent.com/org/repo/abc/file.glb")
                : Bytes(payload));

        using var file = await client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/api/files/1/download", Token, payload.Length, null, CancellationToken.None);

        Assert.Equal(payload.Length, file.Length);
        Assert.Equal(2, handler.Requests.Count);
        Assert.NotNull(handler.Requests[0].Headers.Authorization);
        Assert.Null(handler.Requests[1].Headers.Authorization);
    }

    [Fact]
    public async Task Download_BlocksARedirectToAPrivateAddress()
    {
        var (client, _) = Build(request =>
            request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://192.168.1.10/secret")
                : Bytes(new byte[] { 1 }));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() => client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/api/files/1/download", Token, 1, null, CancellationToken.None));

        Assert.Contains("BlockedDownloadUrl", ex.Message);
    }

    [Fact]
    public async Task Download_StopsAfterTheRedirectHopCap()
    {
        // Always redirects within the store's own origin — only the cap ends this.
        var (client, handler) = Build(_ => RedirectTo($"{StoreUrl}/api/files/next"));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() => client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/api/files/1/download", Token, 1, null, CancellationToken.None));

        Assert.Contains("Too many redirects", ex.Message);
        Assert.Equal(6, handler.Requests.Count); // default cap 5 + the initial request
    }

    [Fact]
    public async Task Download_RejectsARedirectWithNoLocation()
    {
        var (client, _) = Build(_ => new HttpResponseMessage(HttpStatusCode.Found));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() => client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/api/files/1/download", Token, 1, null, CancellationToken.None));

        Assert.Contains("no Location header", ex.Message);
    }

    // Regression (PR 578 review): the store emits RELATIVE download URLs when
    // Store:PublicBaseUrl is unset (its StoreUrlProvider returns the raw path), and the
    // importer used to reject them as "not a valid absolute URL", failing every item.
    [Fact]
    public async Task Download_ResolvesARelativeUrlAgainstTheStoreBase()
    {
        var payload = new byte[] { 7, 7 };
        var (client, handler) = Build(_ => Bytes(payload));

        using var file = await client.DownloadFileAsync(
            StoreUrl, "/api/files/2/download", Token, payload.Length, null, CancellationToken.None);

        Assert.Equal(payload.Length, file.Length);
        Assert.Equal($"{StoreUrl}/api/files/2/download", Assert.Single(handler.Requests).RequestUri!.ToString());
    }

    // An absolute non-http(s) URL must be refused rather than resolved against the store
    // base — otherwise relative-URL support would become a file:// read primitive.
    [Theory]
    [InlineData("file:///etc/passwd")]
    [InlineData("ftp://store.example.com/f")]
    public async Task Download_RejectsANonHttpScheme(string url)
    {
        var (client, _) = Build(_ => Bytes(new byte[] { 1 }));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() => client.DownloadFileAsync(
            StoreUrl, url, Token, 1, null, CancellationToken.None));

        Assert.Contains("InsecureDownloadUrl", ex.Message);
    }

    [Fact]
    public async Task Download_HashesTheStreamedBytes()
    {
        var payload = Encoding.UTF8.GetBytes("modelibr");
        var expected = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(payload)).ToLowerInvariant();
        var (client, _) = Build(_ => Bytes(payload));

        using var file = await client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/f", Token, payload.Length, null, CancellationToken.None);

        Assert.Equal(expected, file.Sha256);
        Assert.True(System.IO.File.Exists(file.TempPath));
    }

    [Fact]
    public async Task Download_RejectsAPayloadLargerThanTheDeclaredContentLength()
    {
        // maxBytes caps previews; a store claiming a small file then streaming a huge one
        // must be cut off rather than filling the disk.
        var (client, _) = Build(_ => Bytes(new byte[4096]));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() => client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/f", Token, expectedSizeBytes: 0, maxBytes: 128, CancellationToken.None));

        Assert.Contains("exceeds the allowed limit", ex.Message);
    }

    [Fact]
    public async Task Download_FailsOnNonSuccessStatus()
    {
        var (client, _) = Build(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        var ex = await Assert.ThrowsAsync<StoreImportException>(() => client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/f", Token, 1, null, CancellationToken.None));

        Assert.Contains("404", ex.Message);
    }

    // The store's own origin is trusted, so it is never block-listed — but it IS resolved once
    // and pinned, so the manifest fetch and every token-bearing download in one import land on
    // the same host. Re-resolving per request would let a 0-TTL record move them apart.
    [Fact]
    public async Task StoreOrigin_IsResolvedOnce_AndReusedAcrossTheManifestAndItsDownloads()
    {
        var (client, _) = Build(request => request.RequestUri!.AbsolutePath.EndsWith("manifest")
            ? Content("""{"schemaVersion":1,"title":"Pack","items":[]}""")
            : Bytes(new byte[8]));

        var lookups = new List<string>();
        client.ResolveHostAsync = (host, _) =>
        {
            lookups.Add(host);
            return Task.FromResult(new[] { IPAddress.Parse("203.0.113.10") });
        };

        await client.FetchManifestAsync(StoreUrl, "asset-1", Token, CancellationToken.None);
        using var first = await client.DownloadFileAsync(StoreUrl, $"{StoreUrl}/f1", Token, 8, null, CancellationToken.None);
        using var second = await client.DownloadFileAsync(StoreUrl, $"{StoreUrl}/f2", Token, 8, null, CancellationToken.None);

        Assert.Equal(new[] { "store.example.com" }, lookups);
    }

    // Pinning is hardening, not a gate: a store host that cannot be resolved here must fall back
    // to the handler's own resolution rather than failing the import with a DNS error.
    [Fact]
    public async Task StoreOrigin_ThatCannotBeResolved_StillDownloads()
    {
        var (client, _) = Build(_ => Bytes(new byte[8]));
        client.ResolveHostAsync = (_, _) => throw new System.Net.Sockets.SocketException();

        using var download = await client.DownloadFileAsync(
            StoreUrl, $"{StoreUrl}/f", Token, 8, null, CancellationToken.None);

        Assert.True(System.IO.File.Exists(download.TempPath));
    }
}
