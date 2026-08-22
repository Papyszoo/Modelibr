using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.StoreCatalog;
using Application.StoreImports;
using Moq;
using SharedKernel;
using WebApi.Infrastructure;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The acquisition boundary: an agent may fetch a free store asset by itself and may never
/// fetch a paid one. The store enforces that too - it serves an anonymous manifest only for
/// an approved free asset - so these tests cover the local half, which exists so the agent
/// gets a usable answer instead of a background job that dies on a 401.
/// </summary>
public class StoreImportMcpToolsTests
{
    private static string Json(object value) => JsonSerializer.Serialize(value);

    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null));
        return audit;
    }

    private static StoreCatalogAsset Asset(decimal price, bool alreadyImported = false) => new(
        StoreAssetId: "11111111-1111-1111-1111-111111111111",
        Title: "Quaternius: Ultimate Furniture Pack",
        Description: null,
        Author: "admin",
        Price: price,
        Currency: "USD",
        IsFree: price == 0m,
        ItemTypes: new[] { "Model" },
        Formats: new[] { "glb" },
        Tags: Array.Empty<string>(),
        ItemCount: 20,
        TotalSizeBytes: 2_681_740,
        ThumbnailUrl: null,
        AlreadyImported: alreadyImported);

    private static Mock<IQueryHandler<GetStoreAssetQuery, StoreCatalogAssetResponse>> Catalog(
        StoreCatalogAsset asset)
    {
        var handler = new Mock<IQueryHandler<GetStoreAssetQuery, StoreCatalogAssetResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetStoreAssetQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new StoreCatalogAssetResponse(
                "https://store.example.com",
                asset,
                CanImportWithoutAccount: asset.IsFree && !asset.AlreadyImported,
                "note")));
        return handler;
    }

    private static Mock<ICommandHandler<CreateStoreImportCommand, CreateStoreImportResponse>> Importer(int jobId = 7)
    {
        var handler = new Mock<ICommandHandler<CreateStoreImportCommand, CreateStoreImportResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateStoreImportCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new CreateStoreImportResponse(jobId)));
        return handler;
    }

    [Fact]
    public async Task A_Free_Asset_Is_Queued_With_No_Import_Token()
    {
        var importer = Importer();
        var audit = ClaimGranted();

        var result = await StoreImportMcpTools.ImportStoreAsset(
            Catalog(Asset(0m)).Object, importer.Object, audit.Object, Caller(),
            "11111111-1111-1111-1111-111111111111", "key-1");

        Assert.Contains("\"queued\"", Json(result));
        Assert.Contains("\"jobId\":7", Json(result));
        // The absent token is the whole feature: a signed-out Modelibr importing CC0.
        importer.Verify(h => h.Handle(
            It.Is<CreateStoreImportCommand>(c =>
                c.ImportToken == null && c.StoreUrl == "https://store.example.com"),
            It.IsAny<CancellationToken>()),
            Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-1", "Pack", null, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task A_Paid_Asset_Is_Refused_Without_Reaching_The_Store()
    {
        var importer = Importer();
        var audit = ClaimGranted();

        var result = await StoreImportMcpTools.ImportStoreAsset(
            Catalog(Asset(4.99m)).Object, importer.Object, audit.Object, Caller(),
            "11111111-1111-1111-1111-111111111111", "key-1");

        Assert.Contains("StoreImport.PaidAssetNeedsTheUser", Json(result));
        importer.Verify(h => h.Handle(
            It.IsAny<CreateStoreImportCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        // A refusal must give the idempotency key back, or accepting the same asset through
        // the UI later would replay as "already applied".
        audit.Verify(a => a.AbandonAsync("key-1", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task An_Asset_This_Library_Already_Holds_Is_Not_Imported_Again()
    {
        var importer = Importer();

        var result = await StoreImportMcpTools.ImportStoreAsset(
            Catalog(Asset(0m, alreadyImported: true)).Object, importer.Object, ClaimGranted().Object, Caller(),
            "11111111-1111-1111-1111-111111111111", "key-1");

        Assert.Contains("StoreImport.AlreadyImported", Json(result));
        importer.Verify(h => h.Handle(
            It.IsAny<CreateStoreImportCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task An_Unreachable_Store_Is_Reported_Rather_Than_Imported_Blind()
    {
        var catalog = new Mock<IQueryHandler<GetStoreAssetQuery, StoreCatalogAssetResponse>>();
        catalog.Setup(h => h.Handle(It.IsAny<GetStoreAssetQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<StoreCatalogAssetResponse>(
                StoreCatalogErrors.Unreachable("https://store.example.com")));
        var importer = Importer();

        var result = await StoreImportMcpTools.ImportStoreAsset(
            catalog.Object, importer.Object, ClaimGranted().Object, Caller(),
            "11111111-1111-1111-1111-111111111111", "key-1");

        Assert.Contains("StoreCatalog.Unreachable", Json(result));
        importer.Verify(h => h.Handle(
            It.IsAny<CreateStoreImportCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
