using Application.Abstractions.Messaging;
using Application.Search;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Xunit.Abstractions;

namespace WebApi.Tests.Integration;

/// <summary>
/// Relevance regression suite: does search actually return assets that fit what was
/// asked for?
///
/// Ranking quality cannot be asserted by unit tests — it is produced by Postgres (ILIKE
/// boundaries, trigram similarity, ordering) over a whole corpus, so this seeds a corpus
/// of <b>real asset names</b> taken from the libraries Modelibr is tested against
/// (Kenney/base-meshes style <c>snake_case</c>, Synty <c>SM_Bld_Apartment_01</c>, Khronos
/// glTF samples) and measures the search the MCP server actually calls.
///
/// Only search documents are seeded — no meshes, no worker, no files — which is what
/// makes a corpus-level relevance suite affordable in CI.
///
/// Each case asserts two things, because only checking for good hits misses the failure
/// mode that actually shipped:
/// <list type="number">
/// <item><b>Relevant</b> names must appear in the top-k (at least <c>MinRelevantInTopK</c>).</item>
/// <item><b>Forbidden</b> names — genuine near-misses — must never <b>outrank</b> a
/// relevant hit. Presence alone is not a failure: when a library holds one traffic light,
/// a light switch at rank 4 is honest recall. A light switch at rank 1 is not.</item>
/// </list>
/// Every forbidden entry is a wrong answer this search really produced against a
/// 1,700-model library. When a case has no relevant assets at all (a nonsense query), the
/// forbidden names must not appear at all.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class SearchRelevanceGoldenTests : IClassFixture<ModelibrWebFactory>
{
    private const int K = 5;
    private const string Marker = "reltest";

    private readonly ModelibrWebFactory _factory;
    private readonly ITestOutputHelper _output;

    public SearchRelevanceGoldenTests(ModelibrWebFactory factory, ITestOutputHelper output)
    {
        _factory = factory;
        _output = output;
    }

    /// <summary>An asset in the fixture corpus: the authored name and its triangle count.</summary>
    private sealed record Fixture(string Name, int Triangles = 1000, bool Rigged = false, double? MaxDimension = 1.0);

    /// <summary>
    /// A deliberately adversarial corpus: for every concept there are both genuine
    /// members and near-miss distractors whose names merely look similar.
    /// </summary>
    private static readonly Fixture[] Corpus =
    {
        // Synty-style buildings (abbreviated) + their parts, which used to outrank them.
        new("SM_Bld_Apartment_01"), new("SM_Bld_Apartment_02"), new("SM_Bld_Shop_01"),
        new("SM_Bld_Office_01"), new("SM_Bld_Warehouse_01"), new("SM_Bld_Skyscraper_01"),
        new("SM_Bld_Apartment_Door_01"), new("SM_Bld_Apartment_Door_02"),
        new("door_01"), new("door_02"), new("door_03"), new("door_04"), new("window_01"),

        // Vehicles + the distractors that substring matching used to promote.
        new("SM_Veh_Car_Van_01", 5681), new("SM_Veh_Car_Police_01", 6100),
        new("SM_Veh_Car_Ambo_01", 6449), new("SM_Veh_Truck_01", 7200),
        // Vehicles only by inference — their names say boat/tram, not "vehicle". They
        // must be reachable by an intent query but must not outrank a named vehicle.
        new("boat_ornament", 900), new("tram_rail", 400), new("ship_wheel", 700),
        new("credit_card", 92), new("cartwheel", 672), new("car_tire_01", 2176),
        // Degenerate exporter leftover — a few triangles, zero volume. Must never answer.
        new("car-01", 8, MaxDimension: 0),

        // Characters + distractors.
        new("SK_Character_Female_Coat", 1995, Rigged: true),
        new("SK_Character_Male_Hoodie", 1670, Rigged: true),
        new("SK_Character_Male_Police", 2128, Rigged: true),
        new("roman_pottery_01"), new("roman_pottery_02"),

        // Weapons + distractors.
        new("axe"), new("mace"), new("longsword"), new("kitchen_knife"),
        new("bowl_01"), new("bowl_02"), new("medieval_bookcase"),

        // Furniture + distractors.
        new("office_chair", 7866), new("dining_chair_01", 3692), new("wooden_chair_01", 1608),
        new("small_plastic_chair", 280), new("park_bench"), new("garden_bench_01"),
        new("clamp"), new("g_clamp"), new("lamp_post_01"),

        // Street/environment.
        new("SM_Prop_TrafficLight_01", 214), new("SM_Prop_Sign_Street_01", 94),
        new("SM_Env_Road_Straight_01"), new("SM_Env_Street_Divider_01"),
        new("light_switch"), new("tealight"),

        // Nature + food, for concept breadth.
        new("SM_Env_Tree_01"), new("pine_tree_01"), new("apple"), new("apple_core"),

        // Trigram-noise bait: these share letters with "street" but nothing else.
        new("strap"), new("straw"), new("staple"), new("stapler"),

        // Plural-form authored names.
        new("wooden_crate_01"), new("wooden_crate_02"), new("barrels_stack"),
    };

    private sealed record Case(
        string Id,
        string Query,
        string[] Relevant,
        string[] Forbidden,
        int MinRelevantInTopK = 1);

    private static readonly Case[] Cases =
    {
        // ── intent queries: the words an agent writes from a brief ────────────
        new("intent-building", "building",
            Relevant: new[] { "SM_Bld_Apartment_01", "SM_Bld_Shop_01", "SM_Bld_Office_01", "SM_Bld_Warehouse_01", "SM_Bld_Skyscraper_01" },
            Forbidden: new[] { "door_01", "door_02", "door_03", "door_04", "window_01" },
            MinRelevantInTopK: 3),
        new("intent-vehicle", "vehicle",
            Relevant: new[] { "SM_Veh_Car_Van_01", "SM_Veh_Car_Police_01", "SM_Veh_Car_Ambo_01", "SM_Veh_Truck_01" },
            // boat/tram/ship are genuinely vehicles by concept, but an asset whose author
            // named it a vehicle must come first — this is what the separate concept field
            // buys, and without it alphabetical order decided the page.
            Forbidden: new[] { "credit_card", "cartwheel", "SK_Character_Male_Police", "boat_ornament", "tram_rail", "ship_wheel" },
            MinRelevantInTopK: 3),
        new("intent-character", "character",
            Relevant: new[] { "SK_Character_Female_Coat", "SK_Character_Male_Hoodie", "SK_Character_Male_Police" },
            Forbidden: new[] { "roman_pottery_01", "roman_pottery_02" },
            MinRelevantInTopK: 3),
        new("intent-weapon", "weapon",
            Relevant: new[] { "axe", "mace", "longsword", "kitchen_knife" },
            Forbidden: new[] { "bowl_01", "bowl_02", "medieval_bookcase" },
            MinRelevantInTopK: 3),
        new("intent-furniture", "furniture",
            Relevant: new[] { "office_chair", "dining_chair_01", "wooden_chair_01", "park_bench", "garden_bench_01", "small_plastic_chair" },
            Forbidden: new[] { "clamp", "g_clamp" },
            MinRelevantInTopK: 3),
        new("intent-streetlight", "streetlight",
            Relevant: new[] { "lamp_post_01" },
            Forbidden: new[] { "light_switch", "tealight" }),

        // ── multi-word: the shape of a real brief ─────────────────────────────
        new("phrase-traffic-light", "traffic light",
            Relevant: new[] { "SM_Prop_TrafficLight_01" },
            Forbidden: new[] { "light_switch", "tealight" }),
        new("phrase-park-bench", "park bench",
            Relevant: new[] { "park_bench", "garden_bench_01" },
            Forbidden: Array.Empty<string>()),
        new("phrase-apartment-building", "apartment building",
            Relevant: new[] { "SM_Bld_Apartment_01", "SM_Bld_Apartment_02" },
            Forbidden: new[] { "SM_Bld_Apartment_Door_01", "SM_Bld_Apartment_Door_02" }),
        new("phrase-long-brief", "a rundown city street at night",
            Relevant: new[] { "SM_Env_Road_Straight_01", "SM_Env_Street_Divider_01", "SM_Prop_Sign_Street_01" },
            Forbidden: new[] { "strap", "straw" }),

        // ── plural forms ──────────────────────────────────────────────────────
        new("plural-chairs", "chairs",
            Relevant: new[] { "office_chair", "dining_chair_01", "wooden_chair_01", "small_plastic_chair" },
            Forbidden: Array.Empty<string>(), MinRelevantInTopK: 3),
        new("plural-buildings", "buildings",
            Relevant: new[] { "SM_Bld_Apartment_01", "SM_Bld_Shop_01", "SM_Bld_Office_01" },
            Forbidden: new[] { "door_01", "window_01" }, MinRelevantInTopK: 2),

        // ── lexical baseline: must not regress ────────────────────────────────
        new("lexical-apple", "apple",
            Relevant: new[] { "apple", "apple_core" }, Forbidden: Array.Empty<string>()),
        new("lexical-apartment", "apartment",
            Relevant: new[] { "SM_Bld_Apartment_01", "SM_Bld_Apartment_02" }, Forbidden: Array.Empty<string>()),
        new("lexical-typo", "aple",
            Relevant: new[] { "apple" }, Forbidden: Array.Empty<string>()),

        // ── fuzzy noise floor ─────────────────────────────────────────────────
        new("noise-strt", "strt",
            Relevant: Array.Empty<string>(),
            Forbidden: new[] { "strap", "straw", "staple" },
            MinRelevantInTopK: 0),
    };

    private async Task SeedAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var existing = await context.AssetSearchDocuments
            .Where(d => d.AssetType == Marker)
            .ToListAsync();
        if (existing.Count > 0)
        {
            context.AssetSearchDocuments.RemoveRange(existing);
            await context.SaveChangesAsync();
        }

        var now = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var id = 1;
        foreach (var fixture in Corpus)
        {
            // Mirror the real projection: tokenise the authored name, widen it, and fold
            // in concept labels — so this suite exercises the same pipeline an import does.
            var tokens = Application.Extraction.Derivation.NameTokenizer.Tokenize(fixture.Name);
            var widened = SearchVocabulary.ExpandForIndex(tokens);
            var labels = CategorySuggester.Suggest(widened);

            context.AssetSearchDocuments.Add(AssetSearchDocument.Create(
                assetType: Marker,
                assetId: id++,
                versionId: null,
                partPath: null,
                isCurrentVersion: true,
                prominence: "full",
                displayName: fixture.Name,
                tokens: string.Join(' ', widened),
                conceptLabels: string.Join(' ', labels),
                browseSummary: $"{fixture.Name} — mesh, {fixture.Triangles} tris",
                updatedAt: now,
                triangleCount: fixture.Triangles,
                boneCount: fixture.Rigged ? 50 : null,
                maxDimension: fixture.MaxDimension));
        }
        await context.SaveChangesAsync();
    }

    private async Task<IReadOnlyList<string>> SearchAsync(string query, Action<AssetSearchQuery>? _ = null)
    {
        using var scope = _factory.Services.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        var result = await handler.Handle(
            new AssetSearchQuery(query, K, false, null, null, null, null, null, Marker,
                null, null, null, null, null, null, null, null, null, null, null, null, null),
            CancellationToken.None);
        Assert.False(result.IsFailure, result.IsFailure ? result.Error.Message : string.Empty);
        return result.Value.Hits.Select(h => h.DisplayName).ToList();
    }

    [Fact]
    public async Task Search_Returns_Assets_That_Fit_The_Query_And_Not_The_Near_Misses()
    {
        await SeedAsync();

        var failures = new List<string>();
        double totalPrecision = 0;
        double totalMrr = 0;

        _output.WriteLine($"{"CASE",-28}{"P@5",6}{"MRR",7}  TOP-5");
        _output.WriteLine(new string('-', 96));

        foreach (var c in Cases)
        {
            var hits = await SearchAsync(c.Query);
            var topK = hits.Take(K).ToList();

            var relevantHits = topK.Count(h => c.Relevant.Contains(h, StringComparer.OrdinalIgnoreCase));
            var precision = topK.Count == 0 ? 0 : (double)relevantHits / topK.Count;
            var firstRelevant = topK.FindIndex(h => c.Relevant.Contains(h, StringComparer.OrdinalIgnoreCase));
            var mrr = firstRelevant < 0 ? 0 : 1.0 / (firstRelevant + 1);
            totalPrecision += precision;
            totalMrr += mrr;

            // A near-miss is only a failure when it beats a genuine hit — or when the
            // query has no genuine hits at all and it shows up regardless.
            var lastRelevantRank = topK.FindLastIndex(h => c.Relevant.Contains(h, StringComparer.OrdinalIgnoreCase));
            var violations = topK
                .Select((name, rank) => (name, rank))
                .Where(x => c.Forbidden.Contains(x.name, StringComparer.OrdinalIgnoreCase))
                .Where(x => c.Relevant.Length == 0 || x.rank < lastRelevantRank || lastRelevantRank < 0)
                .Select(x => $"{x.name}@{x.rank + 1}")
                .ToList();

            _output.WriteLine(
                $"{c.Id,-28}{precision,6:P0}{mrr,7:P0}  {string.Join(", ", topK)}");

            if (violations.Count > 0)
            {
                failures.Add($"{c.Id} (\"{c.Query}\"): near-miss outranked a genuine hit: {string.Join(", ", violations)}");
            }
            if (relevantHits < c.MinRelevantInTopK)
            {
                failures.Add(
                    $"{c.Id} (\"{c.Query}\"): expected >= {c.MinRelevantInTopK} relevant in top-{K}, got {relevantHits}. Returned: {string.Join(", ", topK)}");
            }
        }

        _output.WriteLine(new string('-', 96));
        _output.WriteLine($"AGGREGATE  P@{K}={totalPrecision / Cases.Length:P1}  MRR={totalMrr / Cases.Length:P1}");

        Assert.True(failures.Count == 0, string.Join(Environment.NewLine, failures));
    }

    [Fact]
    public async Task Plural_Queries_Do_Not_Lose_Results_Against_Their_Singular()
    {
        // Regression: the index has no stemming, so "chairs" used to return roughly half
        // of what "chair" did and "boxes" under a third of "box" — a user typing the
        // natural plural silently saw a smaller library.
        await SeedAsync();

        foreach (var (plural, singular) in new[] { ("chairs", "chair"), ("buildings", "building"), ("benches", "bench") })
        {
            var pluralHits = await SearchAsync(plural);
            var singularHits = await SearchAsync(singular);
            Assert.True(
                pluralHits.Count >= singularHits.Count,
                $"\"{plural}\" returned {pluralHits.Count} but \"{singular}\" returned {singularHits.Count}");
        }
    }

    [Fact]
    public async Task Degenerate_Nodes_Never_Answer_A_Triangle_Budget_Query()
    {
        // Regression: "car" under a 10k triangle budget returned "car-01" — 8 triangles,
        // zero volume — at rank 1. An agent building a scene would place an invisible car.
        await SeedAsync();

        using var scope = _factory.Services.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        var result = await handler.Handle(
            new AssetSearchQuery("car", 10, false, null, 10000, null, null, null, Marker,
                null, null, null, null, null, null, null, null, null, null, null, null, null),
            CancellationToken.None);

        var names = result.Value.Hits.Select(h => h.DisplayName).ToList();
        Assert.DoesNotContain("car-01", names);
        Assert.Contains(names, n => n.StartsWith("SM_Veh_Car", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task A_Blank_Query_Browses_By_Filter_Alone()
    {
        // Regression: an empty term returned nothing, so every facet list_facets
        // advertises was unusable on its own — "every rigged asset" was unanswerable.
        await SeedAsync();

        using var scope = _factory.Services.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        var result = await handler.Handle(
            new AssetSearchQuery("", 10, false, null, null, null, null, null, Marker,
                null, null, true, null, null, null, null, null, null, null, null, null, null),
            CancellationToken.None);

        var names = result.Value.Hits.Select(h => h.DisplayName).ToList();
        Assert.NotEmpty(names);
        Assert.All(names, n => Assert.StartsWith("SK_Character", n, StringComparison.OrdinalIgnoreCase));
    }
}
