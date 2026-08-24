using System.Net;
using System.Text;
using Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// Covers StoreCatalogClient - the anonymous reader over the store's public catalog.
///
/// What matters here is that it never becomes a source of failure for the local library:
/// an unreachable, slow or unrecognised store must produce a distinguishable result rather
/// than an exception. The rest is mapping the store's shape onto one the agent can act on
/// without confusing store ids for library ids.
/// </summary>
public class StoreCatalogClientTests
{
    private const string StoreUrl = "https://store.example.com";

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _respond;
        public List<HttpRequestMessage> Requests { get; } = new();

        public RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) => _respond = respond;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(_respond(request));
        }
    }

    private static (StoreCatalogClient Client, RecordingHandler Handler) Build(
        Func<HttpRequestMessage, HttpResponseMessage> respond,
        string? storeUrl = StoreUrl,
        Func<string, IPAddress[]>? resolve = null)
    {
        var handler = new RecordingHandler(respond);
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(StoreCatalogClient.HttpClientName))
            .Returns(() => new HttpClient(handler, disposeHandler: false));

        var settings = new Dictionary<string, string?>();
        if (storeUrl != null)
        {
            settings["STORE_URL"] = storeUrl;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var client = new StoreCatalogClient(
            factory.Object, configuration, NullLogger<StoreCatalogClient>.Instance);
        // Public by default, so the ordinary tests are unaffected by the address check that
        // now runs on every hop. A test that cares supplies its own answers.
        resolve ??= _ => new[] { IPAddress.Parse("93.184.216.34") };
        client.ResolveHostAsync = (host, _) => Task.FromResult(resolve(host));
        return (client, handler);
    }

    private static HttpResponseMessage RedirectTo(string location) =>
        new(HttpStatusCode.Found) { Headers = { Location = new Uri(location) } };

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK)
        => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private const string OnePage = """
        {
          "items": [
            { "id": "11111111-1111-1111-1111-111111111111", "title": "Worn Armchair",
              "author": "cc0-person", "thumbnailUrl": "/api/assets/1/previews/2",
              "itemTypes": ["Model"], "formats": ["glb"], "tags": ["furniture"],
              "fileSize": 2048, "isPack": true, "itemCount": 3, "downloadCount": 9,
              "price": 0, "currency": "USD" },
            { "id": "22222222-2222-2222-2222-222222222222", "title": "Premium Sofa",
              "author": "seller", "thumbnailUrl": "https://cdn.example.com/sofa.png",
              "itemTypes": ["Model"], "formats": ["fbx"], "tags": [],
              "fileSize": 4096, "isPack": false, "itemCount": 1, "downloadCount": 2,
              "price": 12.5, "currency": "USD" }
          ],
          "page": 1, "pageSize": 12, "totalCount": 2, "totalPages": 1
        }
        """;

    [Fact]
    public async Task SearchAsync_Maps_Hits_And_Resolves_Relative_Thumbnails()
    {
        // The store returns a relative preview path when it has no configured public base
        // URL. Handing that to an agent is useless - it only resolves inside the store's SPA.
        var (client, handler) = Build(_ => Json(OnePage));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair", FreeOnly: false), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value.Assets.Count);

        var free = result.Value.Assets[0];
        Assert.Equal("11111111-1111-1111-1111-111111111111", free.StoreAssetId);
        Assert.True(free.IsFree);
        Assert.Equal("https://store.example.com/api/assets/1/previews/2", free.ThumbnailUrl);
        Assert.Equal("https://cdn.example.com/sofa.png", result.Value.Assets[1].ThumbnailUrl);
        Assert.False(result.Value.Assets[1].IsFree);

        Assert.Single(handler.Requests);
        Assert.Contains("search=chair", handler.Requests[0].RequestUri!.Query);
        // Anonymous by construction: this client holds no credential to send.
        Assert.Null(handler.Requests[0].Headers.Authorization);
    }

    [Fact]
    public async Task SearchAsync_When_FreeOnly_Drops_Paid_Assets()
    {
        // The store has no free-only filter, so the client applies it. Offering a paid asset
        // the agent cannot acquire is the more expensive mistake.
        var (client, _) = Build(_ => Json(OnePage));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair", FreeOnly: true), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Worn Armchair", Assert.Single(result.Value.Assets).Title);
        // The store's own count is left untouched: it counted what it matched, not what
        // this client kept.
        Assert.Equal(2, result.Value.TotalCount);
    }

    [Fact]
    public async Task SearchAsync_When_StoreIsDown_Returns_Unreachable_Not_An_Exception()
    {
        var (client, _) = Build(_ => throw new HttpRequestException("connection refused"));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.Unreachable", result.Error.Code);
    }

    [Fact]
    public async Task SearchAsync_When_StoreReturnsGarbage_Returns_Unreachable()
    {
        // A store speaking a shape this build does not understand is the same answer to the
        // caller as one that is down: carry on from the local library.
        var (client, _) = Build(_ => Json("<html>not json</html>"));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.Unreachable", result.Error.Code);
    }

    [Fact]
    public async Task SearchAsync_When_NoStoreConfigured_Returns_NotConfigured_Without_A_Request()
    {
        var (client, handler) = Build(_ => Json(OnePage), storeUrl: null);

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.NotConfigured", result.Error.Code);
        Assert.Empty(handler.Requests);
        Assert.Null(client.StoreUrl);
    }

    [Fact]
    public async Task SearchAsync_When_StoreUrlIsPlainHttp_Refuses_It()
    {
        // The same rule the importer applies: https, or loopback for a developer running a
        // store locally. A configured store is operator-supplied, not therefore trusted.
        var (client, handler) = Build(_ => Json(OnePage), storeUrl: "http://store.example.com");

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.InvalidStoreUrl", result.Error.Code);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task GetAssetAsync_Maps_Items_Previews_And_License()
    {
        const string detail = """
            {
              "id": "11111111-1111-1111-1111-111111111111", "title": "Worn Armchair",
              "description": "A chair", "author": "cc0-person", "thumbnailUrl": "/t.png",
              "itemTypes": ["Model"], "formats": ["glb"], "tags": ["furniture"],
              "fileSize": 2048, "isPack": true, "itemCount": 1, "downloadCount": 0,
              "price": 0, "currency": "USD", "license": "CC0-1.0", "creditName": "Someone",
              "items": [ { "id": "33333333-3333-3333-3333-333333333333", "itemType": "Model",
                           "name": "armchair.glb", "isPreviewable": true,
                           "category": "Furniture", "subcategory": "Seating" } ],
              "previews": [ { "id": "44444444-4444-4444-4444-444444444444", "type": "Thumbnail",
                              "url": "/api/assets/1/previews/4", "fileName": "t.png" } ]
            }
            """;
        var (client, _) = Build(_ => Json(detail));

        var result = await client.GetAssetAsync(
            "11111111-1111-1111-1111-111111111111", CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("CC0-1.0", result.Value.License);
        var item = Assert.Single(result.Value.Items!);
        Assert.Equal("Furniture", item.Category);
        Assert.True(item.IsPreviewable);
        var preview = Assert.Single(result.Value.Previews!);
        Assert.Equal("https://store.example.com/api/assets/1/previews/4", preview.Url);
    }

    /// <summary>
    /// The shape here is the deployed store's: one cover preview with no pack item, then a
    /// thumbnail per item. Losing <c>packItemId</c> would leave a pack's previews as an
    /// unattributed pile of pictures, which is the same as having none.
    /// </summary>
    [Fact]
    public async Task GetAssetAsync_Attributes_Each_Preview_To_Its_Pack_Item()
    {
        const string detail = """
            {
              "id": "11111111-1111-1111-1111-111111111111", "title": "Furniture Pack",
              "author": "cc0-person", "itemTypes": ["Model"], "formats": ["glb"],
              "fileSize": 2048, "isPack": true, "itemCount": 1, "price": 0,
              "items": [ { "id": "33333333-3333-3333-3333-333333333333", "itemType": "Model",
                           "name": "Bed Double", "isPreviewable": true } ],
              "previews": [
                { "id": "44444444-4444-4444-4444-444444444444", "type": "Thumbnail",
                  "url": "/api/assets/1/previews/4", "fileName": "cover.png",
                  "packItemId": null },
                { "id": "55555555-5555-5555-5555-555555555555", "type": "Thumbnail",
                  "url": "/api/assets/1/previews/5", "fileName": "bed_double.png",
                  "packItemId": "33333333-3333-3333-3333-333333333333" } ]
            }
            """;
        var (client, _) = Build(_ => Json(detail));

        var result = await client.GetAssetAsync(
            "11111111-1111-1111-1111-111111111111", CancellationToken.None);

        Assert.True(result.IsSuccess);
        var cover = result.Value.Previews!.Single(p => p.PreviewId.StartsWith("44444444"));
        Assert.Null(cover.PackItemId);
        var perItem = result.Value.Previews!.Single(p => p.PreviewId.StartsWith("55555555"));
        Assert.Equal("33333333-3333-3333-3333-333333333333", perItem.PackItemId);
    }

    [Fact]
    public async Task GetAssetAsync_When_NotFound_Says_The_Listing_Is_Stale()
    {
        var (client, _) = Build(_ => Json("{}", HttpStatusCode.NotFound));

        var result = await client.GetAssetAsync(
            "11111111-1111-1111-1111-111111111111", CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.AssetNotFound", result.Error.Code);
    }

    [Fact]
    public async Task GetAssetAsync_When_IdIsNotAGuid_Does_Not_Call_The_Store()
    {
        // Store ids are Guids and library ids are ints. A library id arriving here is a
        // confusion worth refusing loudly rather than turning into a 404 round trip.
        var (client, handler) = Build(_ => Json("{}"));

        var result = await client.GetAssetAsync("412", CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.AssetNotFound", result.Error.Code);
        Assert.Empty(handler.Requests);
    }

    private const string PageWithMatchedItems = """
        {
          "items": [
            { "id": "33333333-3333-3333-3333-333333333333", "title": "The Base Mesh",
              "author": "cc0-person", "thumbnailUrl": "/t.png",
              "itemTypes": ["Model"], "formats": ["glb"], "tags": [],
              "fileSize": 2048, "isPack": true, "itemCount": 1360, "downloadCount": 0,
              "price": 0, "currency": "USD",
              "matchedItemCount": 15,
              "matchedItems": [
                { "id": "44444444-4444-4444-4444-444444444444", "name": "Dining Chair 01", "itemType": "Model" },
                { "id": "55555555-5555-5555-5555-555555555555", "name": "Office Chair", "itemType": "Model" }
              ] }
          ],
          "page": 1, "pageSize": 12, "totalCount": 1, "totalPages": 1
        }
        """;

    [Fact]
    public async Task SearchAsync_Carries_The_Items_That_Matched_Inside_A_Pack()
    {
        // These ids are what a partial import selects on, so they are the difference between
        // acquiring one chair and acquiring a 1,360-model pack.
        var (client, _) = Build(_ => Json(PageWithMatchedItems));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair", FreeOnly: false), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var hit = Assert.Single(result.Value.Assets);
        Assert.Equal(15, hit.MatchedItemCount);
        Assert.NotNull(hit.MatchedItems);
        Assert.Equal(2, hit.MatchedItems!.Count);
        Assert.Equal("44444444-4444-4444-4444-444444444444", hit.MatchedItems[0].ItemId);
        Assert.Equal("Dining Chair 01", hit.MatchedItems[0].Name);
        Assert.Equal("Model", hit.MatchedItems[0].ItemType);
    }

    [Fact]
    public async Task SearchAsync_Against_A_Store_That_Cannot_Search_Items_Leaves_MatchedItems_Null()
    {
        // Null, not empty. An older store omitting the field means "I did not answer that
        // question"; an empty list would mean "nothing inside the pack matched", and an
        // agent choosing what to import must not read the first as the second.
        var (client, _) = Build(_ => Json(OnePage));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair", FreeOnly: false), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.All(result.Value.Assets, a =>
        {
            Assert.Null(a.MatchedItems);
            // Null, not 0 - a count of zero would read as "nothing inside matched".
            Assert.Null(a.MatchedItemCount);
        });
    }

    // ─── SSRF ────────────────────────────────────────────────────────
    //
    // The catalog client used to validate only the URL it typed and then let the handler
    // resolve and connect on its own. Both halves of that were exploitable: a hostname
    // resolving into private space passes every URL check ever written, and a redirect is a
    // destination the store chooses after the check has happened.

    [Fact]
    public async Task A_Store_Configured_At_Localhost_Over_Https_Is_Allowed_As_The_Documented_Dev_Exception()
    {
        // The one exception that exists, and it is the operator's own: a developer running
        // the store locally. It is the store's OWN origin, which the importer trusts too.
        var (client, handler) = Build(
            _ => Json(OnePage), storeUrl: "https://localhost:5001",
            resolve: _ => new[] { IPAddress.Loopback });

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task A_Store_Hostname_Resolving_Into_Loopback_Is_Not_Followed_Off_Its_Own_Origin()
    {
        // The store's own origin stays trusted - a self-hosted store may legitimately live
        // on a LAN address the operator chose - but anywhere it sends the request afterwards
        // is not, and "somewhere else" is decided by DNS, not by the URL.
        var (client, handler) = Build(
            request => request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://evil.example.com/api/assets")
                : Json(OnePage),
            resolve: host => host == "evil.example.com"
                ? new[] { IPAddress.Loopback }
                : new[] { IPAddress.Parse("93.184.216.34") });

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.Unreachable", result.Error.Code);
        // The redirect target was never requested.
        Assert.Single(handler.Requests);
    }

    [Theory]
    [InlineData("10.0.0.5")]        // RFC1918
    [InlineData("172.16.4.9")]      // RFC1918
    [InlineData("192.168.1.10")]    // RFC1918
    [InlineData("169.254.169.254")] // link-local - the cloud metadata endpoint
    [InlineData("100.64.0.1")]      // carrier-grade NAT
    [InlineData("0.0.0.0")]         // unspecified
    public async Task A_Redirect_To_A_Host_Resolving_Into_Private_Space_Is_Refused(string address)
    {
        var (client, handler) = Build(
            request => request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://elsewhere.example.com/api/assets")
                : Json(OnePage),
            resolve: host => host == "elsewhere.example.com"
                ? new[] { IPAddress.Parse(address) }
                : new[] { IPAddress.Parse("93.184.216.34") });

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task A_Redirect_To_An_Ipv6_Unique_Local_Address_Is_Refused()
    {
        var (client, handler) = Build(
            request => request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://elsewhere.example.com/api/assets")
                : Json(OnePage),
            resolve: host => host == "elsewhere.example.com"
                ? new[] { IPAddress.Parse("fd00::1") }
                : new[] { IPAddress.Parse("93.184.216.34") });

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task A_Redirect_To_A_Literal_Loopback_Address_Is_Refused()
    {
        // No DNS involved at all - classified from the URL, before any lookup.
        var (client, handler) = Build(
            request => request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://127.0.0.1:8080/api/assets")
                : Json(OnePage));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task A_Redirect_Downgrading_To_Http_Is_Refused()
    {
        // Transport-downgrade protection, unchanged: an https store may not bounce the
        // request onto plain http, not even on its own host.
        var (client, handler) = Build(
            request => request.RequestUri!.Scheme == "https"
                ? RedirectTo("http://store.example.com/api/assets")
                : Json(OnePage));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task A_Redirect_Loop_Stops_At_The_Hop_Cap()
    {
        // Also unchanged, and still needed - a public host that keeps redirecting is a
        // denial of service, not an SSRF.
        var (client, handler) = Build(_ => RedirectTo("https://store.example.com/api/assets?again"));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.Unreachable", result.Error.Code);
        // The first request plus MaxRedirects follow-ups, and no more.
        Assert.Equal(4, handler.Requests.Count);
    }

    [Fact]
    public async Task A_Safe_Redirect_Is_Followed_And_Its_Payload_Read()
    {
        // The guard must not turn every redirect into a failure: an external-tier store
        // legitimately 302s to a CDN.
        var (client, handler) = Build(
            request => request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://cdn.example.com/api/assets")
                : Json(OnePage));

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair", FreeOnly: false), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task A_Host_Answering_With_One_Public_And_One_Private_Address_Is_Refused()
    {
        // Rebinding's cheaper cousin: answer with both and hope the check looks at one and
        // the socket picks the other. Every address is classified, not just the pinned one.
        var (client, handler) = Build(
            request => request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://mixed.example.com/api/assets")
                : Json(OnePage),
            resolve: host => host == "mixed.example.com"
                ? new[] { IPAddress.Parse("93.184.216.34"), IPAddress.Parse("10.1.2.3") }
                : new[] { IPAddress.Parse("93.184.216.34") });

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task A_Validated_Host_Is_Pinned_To_The_Address_That_Passed()
    {
        // The rebinding fix itself. Validating a hostname and then handing the hostname to
        // the socket leaves a window in which a 0-TTL record answers differently; the
        // address that passed travels with the request and is what gets dialled.
        var calls = 0;
        var (client, handler) = Build(
            request => request.RequestUri!.Host == "store.example.com"
                ? RedirectTo("https://cdn.example.com/api/assets")
                : Json(OnePage),
            resolve: host =>
            {
                if (host != "cdn.example.com")
                {
                    return new[] { IPAddress.Parse("93.184.216.34") };
                }

                // First answer public, every later one loopback - the rebinding move.
                calls++;
                return calls == 1
                    ? new[] { IPAddress.Parse("93.184.216.34") }
                    : new[] { IPAddress.Loopback };
            });

        var result = await client.SearchAsync(
            new Application.StoreCatalog.StoreCatalogQuery("chair", FreeOnly: false), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var followed = handler.Requests[1];
        Assert.True(
            followed.Options.TryGetValue(StoreEndpointGuard.PinnedAddressKey, out var pinned),
            "the follow-up request carried no pinned address, so the socket would re-resolve");
        Assert.Equal(IPAddress.Parse("93.184.216.34"), pinned);
    }
}
