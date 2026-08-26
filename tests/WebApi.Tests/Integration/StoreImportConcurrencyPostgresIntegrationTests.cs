using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Messaging;
using Application.RecycledFiles;
using Application.StoreImports;
using Domain.Models;
using Domain.Services;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using Xunit;

namespace WebApi.Tests.Integration;

[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class StoreImportConcurrencyPostgresIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;

    public StoreImportConcurrencyPostgresIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Concurrent_Imports_Of_Same_Store_Item_Converge_To_Single_Asset_And_Provenance()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var storeUrl = $"https://store.example.com/{suffix}";
        var assetId = $"asset-{suffix}";
        var storeItemId = $"item-mesh-{suffix}";
        var now = DateTime.UtcNow;

        var meshBytes = new byte[64];
        Random.Shared.NextBytes(meshBytes);
        var meshSha = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(meshBytes)).ToLowerInvariant();

        var manifest = new StoreManifest(
            SchemaVersion: 1,
            Title: $"Test Pack {suffix}",
            Description: "A concurrent test pack",
            License: "CC0",
            Tags: new[] { "test" },
            Items: new[]
            {
                new StoreManifestItem(
                    ItemType: "Model",
                    Name: $"Test Model {suffix}",
                    Files: new[]
                    {
                        new StoreManifestFile("chair.glb", meshBytes.Length, meshSha, "Mesh", "u/chair.glb")
                    },
                    Previews: null,
                    Id: storeItemId)
            },
            Previews: null);

        int job1Id;
        int job2Id;

        using (var setupScope = _factory.Services.CreateScope())
        {
            var jobRepo = setupScope.ServiceProvider.GetRequiredService<IStoreImportJobRepository>();
            var uow = setupScope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var j1 = StoreImportJob.Create(storeUrl, assetId, now);
            var j2 = StoreImportJob.Create(storeUrl, assetId, now);

            await jobRepo.AddAsync(j1);
            await jobRepo.AddAsync(j2);
            await uow.SaveChangesAsync();

            job1Id = j1.Id;
            job2Id = j2.Id;
        }

        // Run two concurrent imports using real DbContext / PostgreSQL advisory locks
        var task1 = Task.Run(async () =>
        {
            using var scope = _factory.Services.CreateScope();
            var processor = CreateProcessor(scope.ServiceProvider, manifest, meshBytes, meshSha);
            await processor.ProcessAsync(new StoreImportWorkItem(job1Id, storeUrl, assetId, "token-1"), CancellationToken.None);
        });

        var task2 = Task.Run(async () =>
        {
            using var scope = _factory.Services.CreateScope();
            var processor = CreateProcessor(scope.ServiceProvider, manifest, meshBytes, meshSha);
            await processor.ProcessAsync(new StoreImportWorkItem(job2Id, storeUrl, assetId, "token-2"), CancellationToken.None);
        });

        await Task.WhenAll(task1, task2);

        // Verify convergent state in PostgreSQL
        using (var verifyScope = _factory.Services.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var canonicalStoreUrl = StoreUrlCanonicalizer.Canonicalize(storeUrl);

            // 1. Exactly 1 Pack created
            var packs = await db.Packs.Where(p => p.StoreImportUrl == canonicalStoreUrl && p.StoreImportAssetId == assetId).ToListAsync();
            Assert.Single(packs);
            var pack = packs[0];

            // 2. Exactly 1 Model created
            var models = await db.Models.Include(m => m.Versions).ThenInclude(v => v.Files).Where(m => m.Name == $"Test Model {suffix}").ToListAsync();
            Assert.Single(models);
            var model = models[0];

            // 3. Exactly 1 StoreImportedItem provenance row
            var provs = await db.StoreImportedItems.Where(p => p.StoreUrl == canonicalStoreUrl && p.StoreAssetId == assetId && p.StoreItemId == storeItemId).ToListAsync();
            Assert.Single(provs);
            Assert.Equal("Model", provs[0].AssetType);
            Assert.Equal(model.Id, provs[0].AssetId);

            // 4. Exactly 1 PackModels association
            var packModelCount = await db.Database
                .SqlQuery<int>($"SELECT COUNT(*)::int as \"Value\" FROM \"PackModels\" WHERE \"PacksId\" = {pack.Id} AND \"ModelsId\" = {model.Id}")
                .SingleAsync();
            Assert.Equal(1, packModelCount);

            // 5. Check job outcomes: one created, one skipped-dedupe
            var j1 = await db.StoreImportJobs.FirstAsync(j => j.Id == job1Id);
            var j2 = await db.StoreImportJobs.FirstAsync(j => j.Id == job2Id);

            Assert.Equal(1, j1.ItemsCreated + j2.ItemsCreated);
            Assert.Equal(1, j1.ItemsSkipped + j2.ItemsSkipped);
            Assert.Equal(0, j1.ItemsFailed + j2.ItemsFailed);
        }
    }

    [Fact]
    public async Task Import_Skips_Soft_Deleted_Asset_Without_Recreating_Duplicates()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var storeUrl = $"https://store.example.com/{suffix}";
        var assetId = $"asset-{suffix}";
        var storeItemId = $"item-softdel-{suffix}";
        var now = DateTime.UtcNow;

        var meshBytes = new byte[64];
        Random.Shared.NextBytes(meshBytes);
        var meshSha = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(meshBytes)).ToLowerInvariant();

        var manifest = new StoreManifest(
            1, $"Pack {suffix}", null, "CC0", null,
            new[] { new StoreManifestItem("Model", $"Model {suffix}", new[] { new StoreManifestFile("chair.glb", meshBytes.Length, meshSha, "Mesh", "u/chair.glb") }, null, storeItemId) },
            null);

        int jobId1;
        int jobId2;

        using (var setupScope = _factory.Services.CreateScope())
        {
            var jobRepo = setupScope.ServiceProvider.GetRequiredService<IStoreImportJobRepository>();
            var uow = setupScope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var j1 = StoreImportJob.Create(storeUrl, assetId, now);
            var j2 = StoreImportJob.Create(storeUrl, assetId, now);
            await jobRepo.AddAsync(j1);
            await jobRepo.AddAsync(j2);
            await uow.SaveChangesAsync();
            jobId1 = j1.Id;
            jobId2 = j2.Id;
        }

        // 1. First import creates the asset
        using (var scope1 = _factory.Services.CreateScope())
        {
            var processor = CreateProcessor(scope1.ServiceProvider, manifest, meshBytes, meshSha);
            await processor.ProcessAsync(new StoreImportWorkItem(jobId1, storeUrl, assetId, "token-1"), CancellationToken.None);
        }

        // 2. Soft-delete the model
        int modelId;
        using (var deleteScope = _factory.Services.CreateScope())
        {
            var db = deleteScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var model = await db.Models.FirstAsync(m => m.Name == $"Model {suffix}");
            modelId = model.Id;
            model.SoftDelete(DateTime.UtcNow);
            await db.SaveChangesAsync();
        }

        // 3. Second import must detect soft-deleted asset and skip without creating duplicate
        using (var scope2 = _factory.Services.CreateScope())
        {
            var processor = CreateProcessor(scope2.ServiceProvider, manifest, meshBytes, meshSha);
            await processor.ProcessAsync(new StoreImportWorkItem(jobId2, storeUrl, assetId, "token-2"), CancellationToken.None);
        }

        using (var verifyScope = _factory.Services.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var allModels = await db.Models.IgnoreQueryFilters().Where(m => m.Name == $"Model {suffix}").ToListAsync();
            Assert.Single(allModels);
            Assert.True(allModels[0].IsDeleted);

            var j2 = await db.StoreImportJobs.FirstAsync(j => j.Id == jobId2);
            Assert.Equal(1, j2.ItemsSkipped);
            Assert.Equal(0, j2.ItemsCreated);
            Assert.Contains("recycle bin", j2.ResultJson);
        }
    }

    [Fact]
    public async Task Hard_Delete_Removes_Provenance_Row()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var storeUrl = $"https://store.example.com/{suffix}";
        var assetId = $"asset-{suffix}";
        var storeItemId = $"item-harddel-{suffix}";
        var now = DateTime.UtcNow;

        var meshBytes = new byte[64];
        Random.Shared.NextBytes(meshBytes);
        var meshSha = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(meshBytes)).ToLowerInvariant();

        var manifest = new StoreManifest(
            1, $"Pack {suffix}", null, "CC0", null,
            new[] { new StoreManifestItem("Model", $"Model {suffix}", new[] { new StoreManifestFile("chair.glb", meshBytes.Length, meshSha, "Mesh", "u/chair.glb") }, null, storeItemId) },
            null);

        int jobId;
        using (var setupScope = _factory.Services.CreateScope())
        {
            var jobRepo = setupScope.ServiceProvider.GetRequiredService<IStoreImportJobRepository>();
            var uow = setupScope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var j = StoreImportJob.Create(storeUrl, assetId, now);
            await jobRepo.AddAsync(j);
            await uow.SaveChangesAsync();
            jobId = j.Id;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var processor = CreateProcessor(scope.ServiceProvider, manifest, meshBytes, meshSha);
            await processor.ProcessAsync(new StoreImportWorkItem(jobId, storeUrl, assetId, "token-1"), CancellationToken.None);
        }

        int modelId;
        var canonicalStoreUrl = StoreUrlCanonicalizer.Canonicalize(storeUrl);
        using (var verifyScope = _factory.Services.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var prov = await db.StoreImportedItems.FirstAsync(p => p.StoreUrl == canonicalStoreUrl && p.StoreAssetId == assetId && p.StoreItemId == storeItemId);
            modelId = prov.AssetId;
        }

        // Permanent deletion must remove provenance through the production command path,
        // not merely prove that the repository can delete its own row.
        using (var hardDelScope = _factory.Services.CreateScope())
        {
            var db = hardDelScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var model = await db.Models.FirstAsync(m => m.Id == modelId);
            model.SoftDelete(DateTime.UtcNow);
            await db.SaveChangesAsync();

            var handler = hardDelScope.ServiceProvider.GetRequiredService<
                ICommandHandler<PermanentDeleteEntityCommand, PermanentDeleteEntityResponse>>();
            var result = await handler.Handle(
                new PermanentDeleteEntityCommand("model", modelId),
                CancellationToken.None);
            Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : null);
        }

        using (var finalScope = _factory.Services.CreateScope())
        {
            var db = finalScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var remaining = await db.StoreImportedItems.Where(p => p.StoreUrl == canonicalStoreUrl && p.StoreAssetId == assetId && p.StoreItemId == storeItemId).ToListAsync();
            Assert.Empty(remaining);
        }
    }

    private static IStoreImportProcessor CreateProcessor(
        IServiceProvider sp, StoreManifest manifest, byte[] fileBytes, string fileSha)
    {
        var clientMock = new Mock<IStoreImportClient>();
        clientMock.Setup(c => c.FetchManifestAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(manifest);

        clientMock.Setup(c => c.DownloadFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .Returns<string, string, string, long, long?, CancellationToken>((_, url, _, _, _, _) =>
            {
                var temp = Path.Combine(Path.GetTempPath(), "test-store-" + Guid.NewGuid().ToString("N") + ".tmp");
                System.IO.File.WriteAllBytes(temp, fileBytes);
                return Task.FromResult(new StoreDownloadedFile(temp, fileSha, fileBytes.Length));
            });

        return new StoreImportProcessor(
            clientMock.Object,
            sp.GetRequiredService<IStoreImportSink>(),
            sp.GetRequiredService<IStoreImportCategoryResolver>(),
            sp.GetRequiredService<IStoreImportJobRepository>(),
            sp.GetRequiredService<IPackRepository>(),
            sp.GetRequiredService<IModelRepository>(),
            sp.GetRequiredService<ITextureSetRepository>(),
            sp.GetRequiredService<ISoundRepository>(),
            sp.GetRequiredService<ISpriteRepository>(),
            sp.GetRequiredService<IEnvironmentMapRepository>(),
            sp.GetRequiredService<IStoreImportedItemRepository>(),
            sp.GetRequiredService<IStoreImportLockService>(),
            sp.GetRequiredService<IDateTimeProvider>(),
            sp.GetRequiredService<IUnitOfWork>(),
            sp.GetRequiredService<IChangeTrackerReset>(),
            sp.GetRequiredService<IStoreImportProgressNotifier>(),
            NullLogger<StoreImportProcessor>.Instance);
    }
}
