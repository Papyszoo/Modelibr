using Application.Abstractions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Covers the two bulk queries behind the denormalised pack names on the search
/// projection. Both are LINQ that only exists to be translated - the handler unit tests
/// mock the repository line away, so a query that EF cannot translate, or that translates
/// to the wrong join, would pass every unit test and fail on the first real rename.
///
/// The bulk shape is not an optimisation detail: pack rename and pack delete rewrite the
/// entire membership, and a real content pack runs to four figures, so the per-asset call
/// in a loop is thousands of round trips inside one request.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class PackProjectionIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public PackProjectionIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetNamesByModelIds_ReturnsEachModelsPacks_AndOmitsUnpackagedOnes()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var now = DateTime.UtcNow;
        var inBoth = Model.Create($"in-both-{suffix}", now);
        var inOne = Model.Create($"in-one-{suffix}", now);
        var inNone = Model.Create($"in-none-{suffix}", now);
        context.Models.AddRange(inBoth, inOne, inNone);
        await context.SaveChangesAsync();

        var alpha = Pack.Create($"Alpha {suffix}", null, null, null, now);
        var beta = Pack.Create($"Beta {suffix}", null, null, null, now);
        alpha.AddModel(inBoth, now);
        alpha.AddModel(inOne, now);
        beta.AddModel(inBoth, now);
        context.Packs.AddRange(alpha, beta);
        await context.SaveChangesAsync();

        var packRepository = scope.ServiceProvider.GetRequiredService<IPackRepository>();

        var names = await packRepository.GetNamesByModelIdsAsync(
            [inBoth.Id, inOne.Id, inNone.Id], CancellationToken.None);

        Assert.Equal([$"Alpha {suffix}", $"Beta {suffix}"], names[inBoth.Id].OrderBy(n => n).ToList());
        Assert.Equal([$"Alpha {suffix}"], names[inOne.Id]);
        // Absent, not present-and-empty - the contract the handlers branch on.
        Assert.False(names.ContainsKey(inNone.Id));
    }

    [Fact]
    public async Task SetPacksForAssets_PatchesAssetDocumentsOnly_AndLeavesPartsAlone()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        // Deliberately high ids: this projection is seeded directly, so it must not
        // collide with documents other integration tests leave in the shared database.
        const int assetOne = 94001;
        const int assetTwo = 94002;
        var now = DateTime.UtcNow;

        context.AssetSearchDocuments.AddRange(
            AssetSearchDocument.Create("Model", assetOne, 1, null, true, "full", $"One {suffix}", "one", "", now),
            // A part of the same asset: pack names are asset-level only, and search never
            // reads the column for a part, so patching it there would be a lie in the data.
            AssetSearchDocument.Create("Model", assetOne, 1, "/root/part", true, "part", $"Part {suffix}", "part", "", now),
            AssetSearchDocument.Create("Model", assetTwo, 1, null, true, "full", $"Two {suffix}", "two", "", now));
        await context.SaveChangesAsync();

        var documentRepository = scope.ServiceProvider.GetRequiredService<IAssetSearchDocumentRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        await documentRepository.SetPacksForAssetsAsync(
            "Model",
            new Dictionary<int, IReadOnlyList<string>>
            {
                [assetOne] = ["Zeta", "Alpha"],
                // The delete case: emptied, not skipped.
                [assetTwo] = [],
            },
            CancellationToken.None);
        await unitOfWork.SaveChangesAsync(CancellationToken.None);

        var reloaded = await context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.AssetType == "Model" && (d.AssetId == assetOne || d.AssetId == assetTwo))
            .ToListAsync();

        // Sorted on the way in, so the same membership always persists as the same string.
        Assert.Equal(
            "Alpha Zeta",
            reloaded.Single(d => d.AssetId == assetOne && d.PartPath == null).PackNames);
        Assert.Null(reloaded.Single(d => d.AssetId == assetOne && d.PartPath == "/root/part").PackNames);
        Assert.Null(reloaded.Single(d => d.AssetId == assetTwo).PackNames);
    }
}
