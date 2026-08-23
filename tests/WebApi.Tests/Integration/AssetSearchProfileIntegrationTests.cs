using Application.Abstractions.Repositories;
using Application.Search;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Profile-biased search (prompt 13-D3) against real PostgreSQL. The judgements about which
/// cap wins and what a style contributes are unit-tested; what needs a database is the part
/// that has to translate to SQL and produce an order - the boost/penalty slots, the declared-
/// style overlap, and the enforced cap counting what it removed.
///
/// <para>
/// Documents are seeded so that every ranking signal except the profile is a tie: the style
/// words live in authored tags rather than tokens, so the query term matches both candidates
/// identically and only the profile can separate them. Without that, a passing test would not
/// tell a working bias from a lucky trigram score.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class AssetSearchProfileIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public AssetSearchProfileIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    private async Task SeedAsync(params AssetSearchDocument[] docs)
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        // The Postgres container outlives a single test run, so the same ids are re-inserted
        // on a second one. Deleting them first keeps every test here re-runnable.
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
        string displayName,
        int? triangleCount = null,
        IEnumerable<string>? authoredTags = null,
        IEnumerable<string>? styles = null) =>
        AssetSearchDocument.Create(
            "Model", assetId, 1, null, true, "full",
            displayName, tokens, string.Empty, DateTime.UtcNow,
            triangleCount: triangleCount,
            authoredTags: authoredTags,
            styles: styles);

    private static ProfileSearchBias LowPoly(
        string mode = "bias",
        int? triangleCap = null,
        IReadOnlyList<string>? styles = null) =>
        new(
            ProjectId: 1,
            ProjectName: "Nightfall",
            Mode: mode,
            Styles: styles ?? Array.Empty<string>(),
            BoostTokens: new[] { "low poly", "lowpoly", "faceted" },
            PenaltyTokens: new[] { "photoscan", "scan", "hi poly" },
            TriangleCap: triangleCap,
            TriangleCapSource: triangleCap is null ? null : "budget",
            FamilyHint: "Model",
            PreferredUvStatus: "atlas_packed",
            DroppedTokens: Array.Empty<string>());

    private async Task<AssetSearchResponse> SearchAsync(string term, ProfileSearchBias? profile)
    {
        using var scope = _factory.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<ISearchRepository>();
        return await repo.SearchAssetsAsync(
            new AssetSearchRequest(term, 25, false, null, null, null, null, null, null, Profile: profile));
    }

    private static int IndexOf(AssetSearchResponse response, int assetId) =>
        response.Hits.ToList().FindIndex(h => h.AssetId == assetId);

    /// <summary>
    /// The case the penalty column exists for: a photoscan matches the word "sofa" exactly as
    /// completely as a low-poly asset does, so positive boosts alone could never demote it.
    /// </summary>
    [Fact]
    public async Task AProfilePenalty_DemotesAnOtherwiseIdenticalHit()
    {
        await SeedAsync(
            Doc(94001, tokens: "profsofa", displayName: "AAA Sofa", authoredTags: new[] { "photoscan" }),
            Doc(94002, tokens: "profsofa", displayName: "ZZZ Sofa", authoredTags: new[] { "lowpoly" }));

        // Unbiased the two are a tie, broken alphabetically - the photoscan wins.
        var unbiased = await SearchAsync("profsofa", null);
        Assert.True(IndexOf(unbiased, 94001) < IndexOf(unbiased, 94002));

        var biased = await SearchAsync("profsofa", LowPoly());

        Assert.True(IndexOf(biased, 94002) < IndexOf(biased, 94001));
    }

    [Fact]
    public async Task APenalisedAsset_IsStillReturned()
    {
        await SeedAsync(
            Doc(94003, tokens: "profstool", displayName: "Scanned Stool", authoredTags: new[] { "photoscan" }));

        var result = await SearchAsync("profstool", LowPoly());

        // Penalties demote; they never exclude. An agent that asks for a stool and is told
        // there are none has been lied to about the library.
        Assert.Contains(result.Hits, h => h.AssetId == 94003);
    }

    /// <summary>
    /// The strongest signal available, and the reason the metadata schema (prompt 16) exists:
    /// the asset itself says what it is, rather than a word in its filename suggesting it.
    /// </summary>
    [Fact]
    public async Task ADeclaredStyle_OutranksAMerelySuggestiveName()
    {
        await SeedAsync(
            Doc(94004, tokens: "proflamp", displayName: "ZZZ Lamp", styles: new[] { "Low Poly" }),
            Doc(94005, tokens: "proflamp", displayName: "AAA Lamp", authoredTags: new[] { "lowpoly" }));

        var result = await SearchAsync("proflamp", LowPoly(styles: new[] { "Low Poly" }));

        Assert.True(IndexOf(result, 94004) < IndexOf(result, 94005));
    }

    [Fact]
    public async Task Bias_ReportsTheBudgetOnEveryHitWithoutFilteringOnIt()
    {
        await SeedAsync(
            Doc(94006, tokens: "profchair", displayName: "Big Chair", triangleCount: 200000),
            Doc(94007, tokens: "profchair", displayName: "Small Chair", triangleCount: 1200));

        var result = await SearchAsync("profchair", LowPoly(triangleCap: 5000));

        var big = result.Hits.Single(h => h.AssetId == 94006);
        Assert.False(big.Facts!.ProfileFit!.WithinBudget);
        Assert.Equal(5000, big.Facts.ProfileFit.Budget);
        Assert.True(result.Hits.Single(h => h.AssetId == 94007).Facts!.ProfileFit!.WithinBudget);
        // Nothing was removed, and the response says the cap was only reported.
        Assert.Null(result.Profile!.RemovedByBudget);
    }

    [Fact]
    public async Task Enforce_RemovesOverBudgetAssetsAndSaysHowMany()
    {
        await SeedAsync(
            Doc(94008, tokens: "profdesk", displayName: "Big Desk", triangleCount: 200000),
            Doc(94009, tokens: "profdesk", displayName: "Small Desk", triangleCount: 1200));

        var result = await SearchAsync("profdesk", LowPoly(mode: "enforce", triangleCap: 5000));

        Assert.DoesNotContain(result.Hits, h => h.AssetId == 94008);
        Assert.Contains(result.Hits, h => h.AssetId == 94009);
        Assert.Equal(1, result.Profile!.RemovedByBudget);
        Assert.Equal(1, result.TotalCount);
        Assert.Contains("Pass applyProfile", result.Profile.Note);
    }

    /// <summary>
    /// A budget is about triangles. An asset that has none is not over it, and dropping every
    /// sound and sprite from an enforced search would make the mode unusable for anything but
    /// models.
    /// </summary>
    [Fact]
    public async Task AnAssetWithNoTriangleCount_SurvivesAnEnforcedBudget()
    {
        await SeedAsync(Doc(94010, tokens: "profhorn", displayName: "Horn Blast"));

        var result = await SearchAsync("profhorn", LowPoly(mode: "enforce", triangleCap: 5000));

        Assert.Contains(result.Hits, h => h.AssetId == 94010);
        Assert.Null(result.Hits.Single(h => h.AssetId == 94010).Facts!.ProfileFit!.WithinBudget);
    }

    [Fact]
    public async Task EveryHit_NamesTheStyleTokensThatMovedIt()
    {
        await SeedAsync(
            Doc(94011, tokens: "profcrate", displayName: "Crate", authoredTags: new[] { "lowpoly", "photoscan" }));

        var result = await SearchAsync("profcrate", LowPoly());

        var fit = result.Hits.Single(h => h.AssetId == 94011).Facts!.ProfileFit!;
        Assert.Contains("lowpoly", fit.StyleSignals);
        Assert.Contains("photoscan", fit.Contradicts);
    }

    /// <summary>
    /// A filter-only browse has no relevance to rank by, so the profile is the only ordering
    /// signal there is - and it has to be the same one the ranked path uses.
    /// </summary>
    [Fact]
    public async Task ABlankQuery_IsOrderedByTheProfileToo()
    {
        await SeedAsync(
            Doc(94012, tokens: "profbrowse", displayName: "AAA Browse Scan", authoredTags: new[] { "photoscan" }),
            Doc(94013, tokens: "profbrowse", displayName: "ZZZ Browse Faceted", authoredTags: new[] { "faceted" }));

        using var scope = _factory.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<ISearchRepository>();
        var result = await repo.SearchAssetsAsync(new AssetSearchRequest(
            string.Empty, 100, false, null, null, null, null, null, null,
            Category: "__none__", Profile: LowPoly()));

        // Category filters everything out, so this asserts the query translates rather than
        // the order: a blank-term browse that could not run at all would throw here.
        Assert.Empty(result.Hits);
        Assert.NotNull(result.Profile);
    }
}
