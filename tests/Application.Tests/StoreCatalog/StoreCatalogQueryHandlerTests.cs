using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.StoreCatalog;
using Domain.Models;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.StoreCatalog;

public class StoreCatalogQueryHandlerTests
{
    private const string StoreUrl = "https://store.example.com";

    private readonly Mock<IStoreCatalogClient> _catalog = new();
    private readonly Mock<IPackRepository> _packRepository = new();

    public StoreCatalogQueryHandlerTests()
    {
        _catalog.SetupGet(c => c.StoreUrl).Returns(StoreUrl);
        _packRepository
            .Setup(r => r.GetImportedStoreAssetIdsAsync(
                It.IsAny<string>(), It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new HashSet<string>());
    }

    private SearchStoreAssetsQueryHandler CreateSearchHandler()
        => new(_catalog.Object, _packRepository.Object);

    private GetStoreAssetQueryHandler CreateDetailHandler()
        => new(_catalog.Object, _packRepository.Object);

    private static StoreCatalogAsset Asset(string id, string title, decimal price = 0m) => new(
        id,
        title,
        Description: null,
        Author: null,
        price,
        Currency: "USD",
        IsFree: price == 0m,
        ItemTypes: new[] { "Model" },
        Formats: new[] { "glb" },
        Tags: Array.Empty<string>(),
        ItemCount: 1,
        TotalSizeBytes: 1024,
        ThumbnailUrl: $"{StoreUrl}/thumb/{id}.png",
        AlreadyImported: false);

    private void SetupSearch(params StoreCatalogAsset[] assets)
    {
        _catalog
            .Setup(c => c.SearchAsync(It.IsAny<StoreCatalogQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new StoreCatalogPage(assets, assets.Length, 1, 12)));
    }

    [Fact]
    public async Task Search_When_StoreNotConfigured_Returns_NotConfigured()
    {
        // The store is optional. An instance without one must say so distinguishably rather
        // than reporting an empty catalog, which would read as "the store has nothing".
        _catalog.SetupGet(c => c.StoreUrl).Returns((string?)null);

        var result = await CreateSearchHandler().Handle(
            new SearchStoreAssetsQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.NotConfigured", result.Error.Code);
    }

    [Fact]
    public async Task Search_When_StoreUnreachable_Propagates_UnreachableError()
    {
        // Distinct from an empty result on purpose: an agent that cannot tell them apart
        // would conclude the store has no chairs and stop asking.
        _catalog
            .Setup(c => c.SearchAsync(It.IsAny<StoreCatalogQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<StoreCatalogPage>(StoreCatalogErrors.Unreachable(StoreUrl)));

        var result = await CreateSearchHandler().Handle(
            new SearchStoreAssetsQuery("chair"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.Unreachable", result.Error.Code);
    }

    [Fact]
    public async Task Search_When_AssetAlreadyImported_Marks_It()
    {
        // The flag is what keeps the store from being proposed for something the user
        // already owns, so it is checked against pack provenance, not guessed from titles.
        SetupSearch(Asset("aaa", "Worn Armchair"), Asset("bbb", "Floor Lamp"));
        _packRepository
            .Setup(r => r.GetImportedStoreAssetIdsAsync(
                StoreUrl, It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new HashSet<string> { "bbb" });

        var result = await CreateSearchHandler().Handle(
            new SearchStoreAssetsQuery("furniture"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.Assets.Single(a => a.StoreAssetId == "aaa").AlreadyImported);
        Assert.True(result.Value.Assets.Single(a => a.StoreAssetId == "bbb").AlreadyImported);
    }

    [Fact]
    public async Task Search_When_NoHits_Does_Not_Query_Provenance()
    {
        // One round trip per page of hits, and none at all for an empty page.
        SetupSearch();

        var result = await CreateSearchHandler().Handle(
            new SearchStoreAssetsQuery("nothing"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Assets);
        _packRepository.Verify(
            r => r.GetImportedStoreAssetIdsAsync(
                It.IsAny<string>(), It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Search_Clamps_PageSize_And_Page()
    {
        // The store's page size is not this tool's to blow up; an agent asking for 5,000
        // results should get a page, not a timeout.
        StoreCatalogQuery? sent = null;
        _catalog
            .Setup(c => c.SearchAsync(It.IsAny<StoreCatalogQuery>(), It.IsAny<CancellationToken>()))
            .Callback<StoreCatalogQuery, CancellationToken>((q, _) => sent = q)
            .ReturnsAsync(Result.Success(new StoreCatalogPage(Array.Empty<StoreCatalogAsset>(), 0, 1, 50)));

        await CreateSearchHandler().Handle(
            new SearchStoreAssetsQuery("chair", Page: 0, PageSize: 5000), CancellationToken.None);

        Assert.NotNull(sent);
        Assert.Equal(1, sent!.Page);
        Assert.Equal(50, sent.PageSize);
    }

    [Fact]
    public async Task GetAsset_When_Free_And_NotImported_Reports_ImportableWithoutAccount()
    {
        // The user's rule: not signed in still means CC0 works. A free approved asset is the
        // only thing this side can fetch on its own.
        _catalog
            .Setup(c => c.GetAssetAsync("aaa", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Asset("aaa", "Worn Armchair")));
        _packRepository
            .Setup(r => r.GetByStoreImportAsync(StoreUrl, "aaa", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Pack?)null);

        var result = await CreateDetailHandler().Handle(
            new GetStoreAssetQuery("aaa"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.CanImportWithoutAccount);
        Assert.False(result.Value.Asset.AlreadyImported);
    }

    [Fact]
    public async Task GetAsset_When_Paid_Reports_NotImportableWithoutAccount()
    {
        // A paid asset is never acquired from this side, whatever the agent decides it wants.
        _catalog
            .Setup(c => c.GetAssetAsync("paid", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Asset("paid", "Premium Sofa", price: 12.50m)));
        _packRepository
            .Setup(r => r.GetByStoreImportAsync(StoreUrl, "paid", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Pack?)null);

        var result = await CreateDetailHandler().Handle(
            new GetStoreAssetQuery("paid"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.CanImportWithoutAccount);
    }

    [Fact]
    public async Task GetAsset_When_AlreadyImported_Is_Not_ImportableAgain()
    {
        // Free, but already here: re-importing it would create a second pack of the same
        // content, which is the duplication the store-provenance key exists to prevent.
        _catalog
            .Setup(c => c.GetAssetAsync("aaa", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(Asset("aaa", "Worn Armchair")));
        _packRepository
            .Setup(r => r.GetByStoreImportAsync(StoreUrl, "aaa", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Pack.Create("Worn Armchair", null, null, null, DateTime.UtcNow));

        var result = await CreateDetailHandler().Handle(
            new GetStoreAssetQuery("aaa"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.Asset.AlreadyImported);
        Assert.False(result.Value.CanImportWithoutAccount);
    }

    [Fact]
    public async Task GetAsset_When_IdIsBlank_Fails_Without_Calling_The_Store()
    {
        var result = await CreateDetailHandler().Handle(
            new GetStoreAssetQuery("   "), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreCatalog.InvalidAssetId", result.Error.Code);
        _catalog.Verify(
            c => c.GetAssetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
