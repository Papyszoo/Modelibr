using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Blender;
using Application.Extraction;
using Application.Extraction.Compute;
using Application.Extraction.Jobs;
using Application.Metadata;
using Application.Search;
using Microsoft.Extensions.Configuration;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

// Application.Extraction and Application.Metadata both declare an AssetMetadataResponse;
// this file reads the extraction one.
using AssetMetadataResponse = Application.Extraction.AssetMetadataResponse;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The batched reads, and the one property that makes them worth having: a bad entry costs
/// its own answer and nothing else.
///
/// A batch that failed whole would be worse than the loop it replaces - the agent would
/// have to retry every question to recover the one that broke, which is more round trips
/// than it started with.
/// </summary>
public class AssetSearchMcpToolsTests
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static JsonElement Read(object value) =>
        JsonSerializer.SerializeToElement(value, Options);

    private static AssetSearchResponse Response(string term) => new(
        [new AssetSearchHit("Model", term.Length, 7, null, term, $"{term} summary", "primary", "name")],
        1);

    [Fact]
    public async Task SearchMany_Answers_Every_Entry_In_Request_Order_With_Its_Own_Label()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetSearchQuery q, CancellationToken _) => Result.Success(Response(q.Term)));

        var result = await AssetSearchMcpTools.SearchMany(
            handler.Object,
            [
                new AssetSearchMcpTools.SearchRequest("sofa", "seating"),
                new AssetSearchMcpTools.SearchRequest("rug"),
            ]);

        var searches = Read(result).GetProperty("searches");

        Assert.Equal(2, searches.GetArrayLength());
        Assert.Equal("seating", searches[0].GetProperty("label").GetString());
        // No label given, so the query is the label - matching answers to questions must
        // never come down to counting.
        Assert.Equal("rug", searches[1].GetProperty("label").GetString());
        Assert.Equal(0, searches[0].GetProperty("index").GetInt32());
    }

    [Fact]
    public async Task SearchMany_Lets_One_Entry_Fail_Without_Losing_The_Others()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetSearchQuery q, CancellationToken _) => q.Term == "broken"
                ? Result.Failure<AssetSearchResponse>(new Error("Search.Bad", "no"))
                : Result.Success(Response(q.Term)));

        var result = await AssetSearchMcpTools.SearchMany(
            handler.Object,
            [
                new AssetSearchMcpTools.SearchRequest("sofa"),
                new AssetSearchMcpTools.SearchRequest("broken"),
                new AssetSearchMcpTools.SearchRequest("rug"),
            ]);

        var searches = Read(result).GetProperty("searches");

        Assert.Equal("Search.Bad", searches[1].GetProperty("error").GetString());
        Assert.Equal(1, searches[0].GetProperty("totalCount").GetInt32());
        Assert.Equal(1, searches[2].GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task SearchMany_Applies_The_Calls_Project_To_Every_Entry()
    {
        // A brief is searched on behalf of one project. Per-entry profiles would be a second
        // way to say the same thing, and two ways to get it wrong.
        var seen = new List<int?>();
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()))
            .Callback<AssetSearchQuery, CancellationToken>((q, _) => seen.Add(q.ProjectId))
            .ReturnsAsync((AssetSearchQuery q, CancellationToken _) => Result.Success(Response(q.Term)));

        await AssetSearchMcpTools.SearchMany(
            handler.Object,
            [
                new AssetSearchMcpTools.SearchRequest("sofa"),
                new AssetSearchMcpTools.SearchRequest("rug"),
            ],
            projectId: 4);

        Assert.Equal([4, 4], seen);
    }

    [Fact]
    public async Task SearchMany_Rejects_An_Empty_Batch_Rather_Than_Answering_Nothing()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();

        var result = await AssetSearchMcpTools.SearchMany(handler.Object, []);

        Assert.Equal("EmptyBatch", Read(result).GetProperty("error").GetString());
        handler.Verify(
            h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetAssets_Reads_Each_Entry_At_The_Version_It_Named()
    {
        // The trap this exists to close: a hit names a version, and answering about the
        // active one instead describes an asset the caller never saw.
        var seen = new List<int?>();
        var handler = new Mock<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .Callback<GetAssetMetadataQuery, CancellationToken>((q, _) => seen.Add(q.VersionId))
            .ReturnsAsync(Result.Failure<AssetMetadataResponse>(new Error("Asset.NotFound", "gone")));

        await AssetSearchMcpTools.GetAssets(
            handler.Object,
            [
                new AssetSearchMcpTools.AssetRequest("Model", 1, 7),
                new AssetSearchMcpTools.AssetRequest("Model", 2, 9),
            ]);

        Assert.Equal([7, 9], seen);
    }

    [Fact]
    public async Task GetAssets_Reports_A_Missing_Asset_Against_Its_Own_Entry()
    {
        var handler = new Mock<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<AssetMetadataResponse>(new Error("Asset.NotFound", "gone")));

        var result = await AssetSearchMcpTools.GetAssets(
            handler.Object, [new AssetSearchMcpTools.AssetRequest("Model", 42)]);

        var assets = Read(result).GetProperty("assets");

        Assert.Equal("Asset.NotFound", assets[0].GetProperty("error").GetString());
        Assert.Equal(42, assets[0].GetProperty("assetId").GetInt32());
    }

    [Fact]
    public async Task GetAsset_Passes_A_PartPath_So_One_Part_Is_Read()
    {
        // The part read is get_asset with partPath (get_part is gone); the query is what
        // carries the narrowing, so that is what this pins.
        var seen = new List<string?>();
        var handler = new Mock<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .Callback<GetAssetMetadataQuery, CancellationToken>((q, _) => seen.Add(q.PartPath))
            .ReturnsAsync(Result.Failure<AssetMetadataResponse>(new Error("PartNotFound", "gone")));

        await AssetSearchMcpTools.GetAsset(handler.Object, "Model", 1, partPath: "/Anvil");

        Assert.Equal(["/Anvil"], seen);
    }

    [Fact]
    public async Task ComputeOnDemand_Returns_The_Cached_Metric()
    {
        var handler = Compute("cached", "{\"space\":\"local\",\"surfaceArea\":12.5}");

        // A cached read needs no writes and queues nothing: it works with the flag off.
        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            handler.Object, ClaimGranted().Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: false), "abc123", "surface-area"));

        Assert.Equal("cached", json.GetProperty("status").GetString());
        Assert.Contains("surfaceArea", json.GetProperty("result").GetString());
    }

    [Fact]
    public async Task ComputeOnDemand_Refuses_A_Metric_Nothing_Can_Produce()
    {
        // "part-render" was advertised while nothing wrote it, and any typo answered
        // "pending" forever. Both now name the vocabulary instead.
        var handler = new Mock<IQueryHandler<GetComputeResultQuery, ComputeResultResponse>>();

        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            handler.Object, ClaimGranted().Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: false), "abc123", "part-render"));

        Assert.Equal("UnknownMetric", json.GetProperty("error").GetString());
        var metrics = json.GetProperty("validMetrics").EnumerateArray()
            .Select(v => v.GetString()).ToList();
        Assert.Contains("surface-area", metrics);
        Assert.Contains("manifold", metrics);
        handler.Verify(
            h => h.Handle(It.IsAny<GetComputeResultQuery>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ComputeOnDemand_Without_A_Model_Names_What_Fills_The_Row()
    {
        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            Compute("pending", null).Object, ClaimGranted().Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: false), "abc123", "manifold"));

        Assert.Equal("pending", json.GetProperty("status").GetString());
        Assert.Contains("analyze_meshes", json.GetProperty("note").GetString());
    }

    [Fact]
    public async Task ComputeOnDemand_Queues_The_Measurement_When_A_Model_Is_Given()
    {
        // The point of the fix: a pending metric must be reachable. The caller names the
        // model that carries the geometry, the tool queues analyze_meshes for it, and the
        // job id is the handle get_job_status can poll. The queue is audited like any write.
        var audit = ClaimGranted();
        var blender = Blender(jobId: 42, versionId: 7);

        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            Compute("pending", null).Object, audit.Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: true), "abc123", "surface-area",
            modelId: 5, versionId: 7, idempotencyKey: "compute-1",
            assetHandler: AssetWithHash("abc123").Object, blender: blender.Object));

        Assert.Equal("pending", json.GetProperty("status").GetString());
        Assert.Equal(42, json.GetProperty("jobId").GetInt32());
        Assert.Contains("get_job_status", json.GetProperty("note").GetString());
        blender.Verify(b => b.Handle(
            It.Is<RequestBlenderOperationCommand>(c =>
                c.ModelId == 5 && c.Operation == BlenderOperations.MeshAnalysis && c.VersionId == 7),
            It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.TryBeginAsync(
            It.Is<AgentWrite>(w => w.Operation == "analyze-meshes" && w.AssetId == 5 && w.IdempotencyKey == "compute-1"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ComputeOnDemand_With_Writes_Off_Returns_Pending_And_Queues_Nothing()
    {
        // The queued job is a write. A server whose operator left MCP_WRITE_ENABLED off must
        // never be made to run Blender from a read tool that was asked for a metric, however
        // plainly the caller named the model that carries the geometry.
        var audit = new Mock<IAgentAudit>();
        var blender = Blender(jobId: 42, versionId: 7);

        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            Compute("pending", null).Object, audit.Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: false), "abc123", "surface-area",
            modelId: 5, versionId: 7, idempotencyKey: "compute-1",
            assetHandler: AssetWithHash("abc123").Object, blender: blender.Object));

        Assert.Equal("pending", json.GetProperty("status").GetString());
        Assert.Contains("MCP_WRITE_ENABLED", json.GetProperty("note").GetString());
        blender.Verify(
            b => b.Handle(It.IsAny<RequestBlenderOperationCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(
            a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ComputeOnDemand_Without_A_Key_Does_Not_Queue()
    {
        // The queue is replay-safe or it is not attempted: without an idempotency key a retry
        // could not be told from a first attempt.
        var audit = new Mock<IAgentAudit>();
        var blender = Blender(jobId: 42, versionId: 7);

        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            Compute("pending", null).Object, audit.Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: true), "abc123", "surface-area",
            modelId: 5, versionId: 7,
            assetHandler: AssetWithHash("abc123").Object, blender: blender.Object));

        Assert.Equal("pending", json.GetProperty("status").GetString());
        Assert.Contains("idempotencyKey", json.GetProperty("note").GetString());
        blender.Verify(
            b => b.Handle(It.IsAny<RequestBlenderOperationCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(
            a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ComputeOnDemand_Normalises_A_Padded_Hash_For_Both_Reads()
    {
        // The hash was looked up raw and compared trimmed, so one value was two. Both reads
        // now see the same normalised hash.
        string? lookedUp = null;
        var handler = new Mock<IQueryHandler<GetComputeResultQuery, ComputeResultResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetComputeResultQuery>(), It.IsAny<CancellationToken>()))
            .Callback<GetComputeResultQuery, CancellationToken>((q, _) => lookedUp = q.GeometryHash)
            .ReturnsAsync(Result.Success(new ComputeResultResponse("pending", null)));

        var blender = Blender(jobId: 42, versionId: 7);
        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            handler.Object, ClaimGranted().Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: true), "  abc123  ", "surface-area",
            modelId: 5, versionId: 7, idempotencyKey: "compute-1",
            assetHandler: AssetWithHash("abc123").Object, blender: blender.Object));

        Assert.Equal("abc123", lookedUp);
        Assert.Equal(42, json.GetProperty("jobId").GetInt32());
    }

    [Fact]
    public async Task ComputeOnDemand_Refuses_A_Model_That_Does_Not_Carry_The_Geometry()
    {
        // Queueing a job for some other mesh would leave this row unwritten and the caller
        // polling for an answer that never comes - the pending-forever shape to avoid.
        var blender = Blender(jobId: 42, versionId: 7);

        var json = Read(await AssetSearchMcpTools.ComputeOnDemand(
            Compute("pending", null).Object, ClaimGranted().Object, McpCallerContext.Unauthenticated(),
            Configuration(writeEnabled: true), "abc123", "surface-area",
            modelId: 5, versionId: 7, idempotencyKey: "compute-1",
            assetHandler: AssetWithHash("other-hash").Object, blender: blender.Object));

        Assert.Equal("GeometryNotOnModel", json.GetProperty("error").GetString());
        blender.Verify(
            b => b.Handle(It.IsAny<RequestBlenderOperationCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetIndexStatus_Reports_What_The_Handler_Answered()
    {
        var handler = new Mock<IQueryHandler<GetIndexStatusQuery, IndexStatusResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetIndexStatusQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new IndexStatusResponse(
                1, [new IndexStatusFamily("Model", 10, 9, 1)], 10, 9, 1, ["notes"])));

        var json = Read(await AssetSearchMcpTools.GetIndexStatus(handler.Object));

        Assert.Equal(10, json.GetProperty("totalDerived").GetInt32());
        Assert.Equal(9, json.GetProperty("totalIndexed").GetInt32());
    }

    [Fact]
    public async Task GetImportSuggestions_Passes_The_Page_And_Returns_The_Entries()
    {
        var handler = new Mock<IQueryHandler<ImportSuggestionsQuery, ImportSuggestionsResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<ImportSuggestionsQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ImportSuggestionsQuery q, CancellationToken _) => Result.Success(
                new ImportSuggestionsResponse(
                    1, q.Page, q.PageSize,
                    [new ImportSuggestionItem(
                        7, "chair", null, "None", 3, "Props", ["chair"], "/lib",
                        new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc))])));

        var json = Read(await AssetMetadataReadMcpTools.GetImportSuggestions(handler.Object, page: 2, pageSize: 10));

        handler.Verify(h => h.Handle(
            It.Is<ImportSuggestionsQuery>(q => q.Page == 2 && q.PageSize == 10),
            It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, json.GetProperty("total").GetInt32());
        Assert.Equal(7, json.GetProperty("items")[0].GetProperty("modelId").GetInt32());
    }

    /// <summary>The compute cache read, answering a fixed status.</summary>
    private static Mock<IQueryHandler<GetComputeResultQuery, ComputeResultResponse>> Compute(
        string status, string? result)
    {
        var handler = new Mock<IQueryHandler<GetComputeResultQuery, ComputeResultResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetComputeResultQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new ComputeResultResponse(status, result)));
        return handler;
    }

    /// <summary>Configuration carrying the write-surface flag, as Program.cs publishes it.</summary>
    private static IConfiguration Configuration(bool writeEnabled) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["MCP_WRITE_ENABLED"] = writeEnabled ? "true" : "false",
            })
            .Build();

    /// <summary>An audit whose claim is granted and whose completion succeeds.</summary>
    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, "token"));
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<int?>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    /// <summary>A model read whose single part carries <paramref name="hash"/>.</summary>
    private static Mock<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>> AssetWithHash(string hash)
    {
        var handler = new Mock<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AssetMetadataResponse(
                "Model", 5, 7, 1, default,
                [new AssetPartView("/Anvil", "Anvil", null, 0, "mesh", 500, 300, hash, true, [])],
                [], [])));
        return handler;
    }

    /// <summary>The Blender request handler, answering a queued analysis.</summary>
    private static Mock<ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested>> Blender(
        int jobId, int versionId)
    {
        var handler = new Mock<ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested>>();
        handler.Setup(h => h.Handle(It.IsAny<RequestBlenderOperationCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new BlenderOperationRequested(
                jobId, BlenderOperations.MeshAnalysis, 5, versionId, AlreadyQueued: false)));
        return handler;
    }
}
