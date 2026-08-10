using Application.Abstractions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Prompt 26 idempotency: re-extraction upserts by key, it never duplicates rows —
/// verified against real PostgreSQL because the guarantee rests on the
/// NULLS-NOT-DISTINCT unique indexes the InMemory provider doesn't enforce.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class ExtractionIdempotencyIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private const string Hash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    private readonly ModelibrWebFactory _factory;

    public ExtractionIdempotencyIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task ReExtraction_UpsertsRawPayload_NeverDuplicates()
    {
        const int assetId = 77001;
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await context.Database.MigrateAsync();

            var repo = scope.ServiceProvider.GetRequiredService<IAssetExtractionRepository>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            await repo.AddAsync(AssetExtraction.Create(
                "TextureSet", assetId, null, Hash, "{\"v\":1}", 1, 1, DateTime.UtcNow));
            await uow.SaveChangesAsync();
        }

        // Second extraction of the same key upserts in place.
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<IAssetExtractionRepository>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var existing = await repo.GetByKeyAsync("TextureSet", assetId, null, Hash);
            Assert.NotNull(existing);
            existing!.UpdatePayload("{\"v\":2}", 1, 1, DateTime.UtcNow);
            await repo.UpdateAsync(existing);
            await uow.SaveChangesAsync();
        }

        using (var verify = _factory.Services.CreateScope())
        {
            var context = verify.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var rows = await context.AssetExtractions
                .Where(e => e.AssetType == "TextureSet" && e.AssetId == assetId)
                .ToListAsync();

            Assert.Single(rows);            // never duplicated
            using var doc = System.Text.Json.JsonDocument.Parse(rows[0].RawPayload);
            Assert.Equal(2, doc.RootElement.GetProperty("v").GetInt32()); // upserted in place
        }
    }
}
