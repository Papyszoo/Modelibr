using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Search;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Exercises the prompt-24 structured search against real PostgreSQL - the FTS +
/// pg_trgm behaviour (ranking, literal non-ASCII matching) cannot be reproduced on
/// EF Core's InMemory provider. Documents are seeded directly into the projection
/// so these tests cover the search SQL itself, independent of the derive pipeline.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class AssetSearchIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public AssetSearchIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    /// <summary>
    /// Seeds documents, replacing any row already holding the same key.
    ///
    /// The Postgres container outlives a single <c>dotnet test</c> invocation, and nothing
    /// here cleans up after itself, so a second run of the same test re-inserts ids the first
    /// run already wrote and dies on the unique index - a failure that has nothing to do with
    /// the behaviour under test and only appears on the second run. Deleting the same keys
    /// first makes every test in this class re-runnable without weakening what it asserts:
    /// each still seeds exactly the documents it names and searches over them.
    /// </summary>
    private async Task SeedAsync(params AssetSearchDocument[] docs)
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var assetIds = docs.Select(d => d.AssetId).Distinct().ToList();
        var stale = await context.AssetSearchDocuments
            .Where(d => d.AssetType == "Model" && assetIds.Contains(d.AssetId))
            .ToListAsync();
        if (stale.Count > 0)
        {
            context.AssetSearchDocuments.RemoveRange(stale);
            await context.SaveChangesAsync();
        }

        context.AssetSearchDocuments.AddRange(docs);
        await context.SaveChangesAsync();
    }

    private static AssetSearchDocument Doc(
        int assetId,
        string tokens,
        string browseSummary = "",
        int? versionId = 1,
        bool current = true,
        string prominence = "full",
        string? partPath = null,
        int? triangleCount = null,
        string displayName = "Doc",
        int? vertexCount = null,
        int? materialCount = null,
        bool? hasUvs = null,
        string? uvStatus = null,
        int? partCount = null,
        int? boneCount = null,
        double? maxDimension = null,
        int? categoryId = null,
        string? categoryName = null,
        IEnumerable<string>? packNames = null) =>
        AssetSearchDocument.Create(
            "Model", assetId, versionId, partPath, current, prominence,
            displayName, tokens, browseSummary, DateTime.UtcNow,
            packNames: packNames,
            triangleCount: triangleCount,
            boneCount: boneCount,
            vertexCount: vertexCount,
            materialCount: materialCount,
            hasUvs: hasUvs,
            uvStatus: uvStatus,
            partCount: partCount,
            maxDimension: maxDimension,
            categoryId: categoryId,
            categoryName: categoryName);

    private async Task<AssetSearchResponse> SearchAsync(AssetSearchRequest request)
    {
        using var scope = _factory.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<ISearchRepository>();
        return await repo.SearchAssetsAsync(request);
    }

    private static AssetSearchRequest Request(string term, int? min = null, int? max = null) =>
        new(term, 25, false, min, max, null, null, null, null);

    [Fact]
    public async Task TokenisedName_RanksAboveSubstringOnlyMatch()
    {
        await SeedAsync(
            Doc(90101, tokens: "chairtoken wooden", browseSummary: "A wooden seat"),
            Doc(90102, tokens: "table metal", browseSummary: "Contains the word chairtoken in prose only"));

        var result = await SearchAsync(Request("chairtoken"));

        Assert.True(result.Hits.Count >= 2);
        // The tokenised-name hit outranks the prose/substring hit.
        Assert.Equal(90101, result.Hits[0].AssetId);
        Assert.Equal("token", result.Hits[0].MatchedOn);
    }

    [Fact]
    public async Task PackName_FindsItsMembers()
    {
        // Author-written grouping: the library already knows this asset ships in
        // "Polygonopolis", so "polygonopolis" should reach it even though nothing in the
        // asset's own name or tokens says so.
        await SeedAsync(
            Doc(91101, tokens: "bench wooden", displayName: "Bench",
                packNames: new[] { "Polygonopolis" }));

        var result = await SearchAsync(Request("polygonopolis"));

        Assert.Contains(result.Hits, h => h.AssetId == 91101);
    }

    [Fact]
    public async Task PackName_RanksBelowTheAssetsOwnName()
    {
        // A pack is a container, not a description. "The Base Mesh" has 1,360 members, so
        // a pack-name match admits a huge undifferentiated set and must never displace a
        // document that matched on what the asset actually is.
        await SeedAsync(
            // Matches only because it lives in a pack of that name.
            Doc(91111, tokens: "bench wooden", displayName: "Bench",
                packNames: new[] { "Streetlamp" }),
            // Matches on its own authored name.
            Doc(91112, tokens: "streetlamp metal", displayName: "Streetlamp"));

        var result = await SearchAsync(Request("streetlamp"));

        Assert.True(result.Hits.Count >= 2);
        Assert.Equal(91112, result.Hits[0].AssetId);
    }

    [Fact]
    public async Task NonAsciiIdentifier_IsIndexedLiterally()
    {
        await SeedAsync(Doc(90201, tokens: "ściana brick", browseSummary: "wall segment"));

        var result = await SearchAsync(Request("ściana"));

        Assert.Contains(result.Hits, h => h.AssetId == 90201);
    }

    [Fact]
    public async Task CurrentVersionOnly_IsReturnedByDefault()
    {
        await SeedAsync(
            Doc(90301, tokens: "barreltoken", versionId: 1, current: true),
            Doc(90301, tokens: "barreltoken", versionId: 2, current: false));

        var result = await SearchAsync(Request("barreltoken"));

        var mine = result.Hits.Where(h => h.AssetId == 90301).ToList();
        Assert.Single(mine);
        Assert.Equal(1, mine[0].VersionId);
    }

    [Fact]
    public async Task StructuralFilter_TriangleRange_NarrowsResults()
    {
        await SeedAsync(
            Doc(90401, tokens: "widgetfilter", triangleCount: 100),
            Doc(90402, tokens: "widgetfilter", triangleCount: 100000));

        var result = await SearchAsync(Request("widgetfilter", min: 50000));

        var mine = result.Hits.Where(h => h.AssetId is 90401 or 90402).ToList();
        Assert.Single(mine);
        Assert.Equal(90402, mine[0].AssetId);
    }

    [Fact]
    public async Task SizeFilter_NarrowsByLargestDimension()
    {
        await SeedAsync(
            Doc(90601, tokens: "sizefilter", maxDimension: 0.4),
            Doc(90602, tokens: "sizefilter", maxDimension: 2.1));

        var result = await SearchAsync(Request("sizefilter") with { MinSize = 1.0 });

        var mine = result.Hits.Where(h => h.AssetId is 90601 or 90602).ToList();
        Assert.Single(mine);
        Assert.Equal(90602, mine[0].AssetId);
    }

    [Fact]
    public async Task RigFilter_HasRig_ReturnsOnlyRiggedAssets()
    {
        await SeedAsync(
            Doc(90701, tokens: "rigfilter", boneCount: 0),
            Doc(90702, tokens: "rigfilter", boneCount: 34));

        var result = await SearchAsync(Request("rigfilter") with { HasRig = true });

        var mine = result.Hits.Where(h => h.AssetId is 90701 or 90702).ToList();
        Assert.Single(mine);
        Assert.Equal(90702, mine[0].AssetId);
    }

    [Fact]
    public async Task MaterialAndUvFilters_Discriminate()
    {
        await SeedAsync(
            Doc(90801, tokens: "matfilter", materialCount: 1, hasUvs: false),
            Doc(90802, tokens: "matfilter", materialCount: 5, hasUvs: true));

        var byMaterials = await SearchAsync(Request("matfilter") with { MinMaterials = 3 });
        Assert.Single(byMaterials.Hits.Where(h => h.AssetId is 90801 or 90802));
        Assert.Equal(90802, byMaterials.Hits.First(h => h.AssetId is 90801 or 90802).AssetId);

        var byUvs = await SearchAsync(Request("matfilter") with { HasUvs = false });
        Assert.Single(byUvs.Hits.Where(h => h.AssetId is 90801 or 90802));
        Assert.Equal(90801, byUvs.Hits.First(h => h.AssetId is 90801 or 90802).AssetId);
    }

    /// <summary>
    /// The pair the whole classification exists for. Both assets report <c>hasUvs: true</c>,
    /// and only one of them can receive a baked texture set - so a filter that could only ask
    /// "does it have UVs" returned both and an agent picked the wrong one.
    /// </summary>
    [Fact]
    public async Task UvStatusFilter_Separates_A_Bakeable_Asset_From_An_Atlas_Packed_One()
    {
        await SeedAsync(
            Doc(91001, tokens: "uvfilter", hasUvs: true, uvStatus: "unwrapped"),
            Doc(91002, tokens: "uvfilter", hasUvs: true, uvStatus: "atlas_packed"));

        var byHasUvs = await SearchAsync(Request("uvfilter") with { HasUvs = true });
        Assert.Equal(2, byHasUvs.Hits.Count(h => h.AssetId is 91001 or 91002));

        var packed = await SearchAsync(Request("uvfilter") with { UvStatus = "atlas_packed" });
        var packedHits = packed.Hits.Where(h => h.AssetId is 91001 or 91002).ToList();
        Assert.Single(packedHits);
        Assert.Equal(91002, packedHits[0].AssetId);
        Assert.Equal("atlas_packed", packedHits[0].Facts?.UvStatus);
    }

    /// <summary>
    /// Exact match on a closed vocabulary, unlike the category filter's partial match - the
    /// caller picks from five fixed values, so a substring match would only be a way to
    /// select the wrong one.
    /// </summary>
    [Fact]
    public async Task UvStatusFilter_Does_Not_Match_On_A_Substring()
    {
        await SeedAsync(Doc(91003, tokens: "uvsubstring", uvStatus: "atlas_packed"));

        var response = await SearchAsync(Request("uvsubstring") with { UvStatus = "atlas" });

        Assert.DoesNotContain(response.Hits, h => h.AssetId == 91003);
    }

    [Fact]
    public async Task CategoryFilter_MatchesAssignedCategoryByPartialName()
    {
        await SeedAsync(
            Doc(90901, tokens: "catfilter", categoryId: 7, categoryName: "Sci-Fi Weapons"),
            Doc(90902, tokens: "catfilter", categoryId: 8, categoryName: "Vehicles"));

        var result = await SearchAsync(Request("catfilter") with { Category = "weapon" });

        var mine = result.Hits.Where(h => h.AssetId is 90901 or 90902).ToList();
        Assert.Single(mine);
        Assert.Equal(90901, mine[0].AssetId);
    }

    [Fact]
    public async Task ConceptualQuery_HitsViaFoldedSemanticLabel()
    {
        // The builder folds concept labels into a doc's tokens (a sword-carrying asset
        // gets the "weapon" token). This is the semantic bridge the retrieval test needed:
        // a bare "weapon" query returns the asset even though its authored name is "sword".
        await SeedAsync(Doc(91001, tokens: "sword blade weapon", displayName: "Sword"));

        var result = await SearchAsync(Request("weapon"));

        Assert.Contains(result.Hits, h => h.AssetId == 91001);
    }

    [Fact]
    public async Task StructuredSearch_WritesExactlyOneLogRow()
    {
        await SeedAsync(Doc(90501, tokens: "loggedterm", browseSummary: "loggable"));

        using var scope = _factory.Services.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();

        var result = await handler.Handle(new AssetSearchQuery("loggedterm"), CancellationToken.None);
        Assert.True(result.IsSuccess);

        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var logCount = await context.SearchLogs.CountAsync(l => l.Query == "loggedterm");
        Assert.Equal(1, logCount);
    }
}
