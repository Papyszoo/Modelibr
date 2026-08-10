using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Extraction;
using Application.Extraction.Compute;
using Application.Search;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Prompt 27 definition of done: a scripted end-to-end (search → get_asset →
/// compute_on_demand) round-trips through the MCP tools, which are a pure
/// pass-through to the real query handlers backed by PostgreSQL. Proves every tool
/// returns real data from a seeded library.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class McpRoundTripIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private const int AssetId = 88001;
    private const string Hash = "cccc000000000000";

    private readonly ModelibrWebFactory _factory;

    public McpRoundTripIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    private async Task SeedAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();
        var now = DateTime.UtcNow;

        context.AssetDerivations.Add(AssetDerivation.Create(
            "Model", AssetId, 1, 1,
            "{\"deriveVersion\":1,\"browseSummary\":\"Anvil — 1 part\",\"tokens\":[\"anvil\"]}", now));

        context.AssetParts.Add(AssetPart.Create(
            "Model", AssetId, 1, "/Anvil", "Anvil", 1, "mesh", now,
            geometryHash: Hash, triangleCount: 500));

        context.AssetSearchDocuments.Add(AssetSearchDocument.Create(
            "Model", AssetId, 1, null, true, "full", "Anvil", "mcpanvil", "Anvil — 1 part", now,
            triangleCount: 500));

        context.ComputeCacheEntries.Add(ComputeCacheEntry.Create(
            Hash, 1, "uv-overlap", "{\"uvOverlap\":0.01}", now));

        await context.SaveChangesAsync();
    }

    private static string Json(object o) => JsonSerializer.Serialize(o);

    [Fact]
    public async Task McpTools_SearchThenGetAssetThenCompute_RoundTrips()
    {
        await SeedAsync();
        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;

        // 1. search_assets → finds the seeded asset.
        var searchResult = await AssetSearchMcpTools.SearchAssets(
            sp.GetRequiredService<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>(),
            "mcpanvil");
        var searchJson = Json(searchResult);
        Assert.Contains("\"totalCount\"", searchJson);
        Assert.Contains(AssetId.ToString(), searchJson);

        // 2. get_asset → returns derived metadata + parts.
        var assetResult = await AssetSearchMcpTools.GetAsset(
            sp.GetRequiredService<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>(),
            "Model", AssetId);
        var assetJson = Json(assetResult);
        Assert.Contains("browseSummary", assetJson, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("/Anvil", assetJson);
        Assert.Contains(Hash, assetJson);

        // 3. get_part → returns the single part.
        var partResult = await AssetSearchMcpTools.GetPart(
            sp.GetRequiredService<IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>>(),
            "Model", AssetId, "/Anvil");
        Assert.Contains("/Anvil", Json(partResult));

        // 4. compute_on_demand → returns the cached metric (by geometry hash from step 2/3).
        var computeResult = await AssetSearchMcpTools.ComputeOnDemand(
            sp.GetRequiredService<IQueryHandler<GetComputeResultQuery, ComputeResultResponse>>(),
            Hash, "uv-overlap");
        var computeJson = Json(computeResult);
        Assert.Contains("cached", computeJson);
        Assert.Contains("uvOverlap", computeJson);

        // 5. list_facets → advertises the structural filters.
        Assert.Contains("shapeClass", Json(AssetSearchMcpTools.ListFacets()));
    }
}
