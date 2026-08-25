using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Metadata;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// One metadata patch, one transaction - proven where the claim actually lives.
///
/// <para>
/// Four of the six families spend two command handlers on a single entity write, each
/// committing through the unit-of-work decorator, and the schema side table is a third
/// write after them. That is three commits for what a caller asked for as one change, and
/// a failure between any two of them left the earlier ones durable while the response said
/// nothing had been written. The agent surface believes that response: it releases the
/// idempotency key, and the retry applies the committed half a second time.
/// </para>
///
/// <para>
/// Nothing below a real database can test this. The InMemory provider has no transactions
/// to join and no constraints to trip, and a mocked unit of work is precisely the thing
/// under doubt.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class AssetMetadataPatchAtomicityIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;

    public AssetMetadataPatchAtomicityIntegrationTests(ModelibrWebFactory factory)
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

    // ─── The reported repro: a value the side table cannot hold ──────

    [Fact]
    public async Task An_Overlong_Side_Table_Value_Refuses_The_Patch_Before_Any_Of_It_Lands()
    {
        // licenseName's column is varchar(200). The patch also carries tags, description and
        // a category - which used to commit first and stay committed while the response
        // reported a failure.
        var (modelId, categoryId) = await SeedModelAsync();

        var result = await PatchAsync("Model", modelId, new Dictionary<string, object?>
        {
            ["tags"] = new[] { "wood", "crate" },
            ["description"] = "a crate",
            ["category"] = categoryId,
            ["licenseName"] = new string('L', 201),
        });

        Assert.True(result.IsFailure);
        // Named at the boundary, so the caller learns what to shorten rather than reading a
        // database error - and so the idempotency key stays honestly retryable.
        Assert.Equal("MetadataValueTooLong", result.Error.Code);
        Assert.Contains("200", result.Error.Message);

        await AssertModelUntouchedAsync(modelId);
        Assert.Null(await StoredMetadataAsync("Model", modelId));
    }

    [Fact]
    public async Task A_Value_The_Database_Refuses_Rolls_Back_The_Entity_Half_Of_The_Patch()
    {
        // The half prevalidation cannot do. A NUL byte is legal JSON, legal .NET, within
        // every length limit, and rejected by PostgreSQL when it reaches a text column - so
        // it stands in for every constraint nobody thought to check first. Without the
        // transaction the tags and description are already durable by the time it fails.
        var (modelId, categoryId) = await SeedModelAsync();

        await Assert.ThrowsAnyAsync<Exception>(() => PatchAsync("Model", modelId, new Dictionary<string, object?>
        {
            ["tags"] = new[] { "wood", "crate" },
            ["description"] = "a crate",
            ["category"] = categoryId,
            // A NUL byte: valid JSON, valid .NET, inside every length limit, and rejected
            // by PostgreSQL the moment it reaches a text column.
            ["licenseName"] = "CC0\u0000 1.0",
        }));

        await AssertModelUntouchedAsync(modelId);
        Assert.Null(await StoredMetadataAsync("Model", modelId));
    }

    // ─── The multi-command families ──────────────────────────────────

    [Fact]
    public async Task A_Category_Deleted_Between_Validation_And_Use_Leaves_No_Partial_Patch()
    {
        // A TextureSet patch is two commands: tags, then category. Validation says the
        // category is there - and it is, at that moment. Somebody deletes it before the
        // second command runs, which is a window no amount of checking first can close.
        //
        // What used to happen: the tags committed, the category command failed, and the
        // caller was told the patch did not happen.
        var (textureSetId, categoryId) = await SeedTextureSetAsync(TextureSetKind.ModelSpecific);

        using var scope = _factory.Services.CreateScope();
        var deleted = false;
        var handler = HandlerWithHook(scope, onAfterValidation: async () =>
        {
            if (deleted) return;
            deleted = true;
            // A separate scope, so a separate DbContext and a separate transaction that
            // commits on its own - the shape a concurrent caller actually has.
            using var other = _factory.Services.CreateScope();
            var context = other.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await context.TextureSetCategories.Where(c => c.Id == categoryId).ExecuteDeleteAsync();
        });

        var result = await handler.Handle(
            new SetAssetMetadataCommand("TextureSet", textureSetId, Fields(new Dictionary<string, object?>
            {
                ["tags"] = new[] { "stone", "wall" },
                ["category"] = categoryId,
                ["licenseName"] = "CC0",
            })),
            CancellationToken.None);

        Assert.True(deleted);
        Assert.True(result.IsFailure);

        // Not one of the three writes survived - not the tags that committed first, not the
        // side table, not the category that could not be set.
        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var textureSet = await db.TextureSets
            .AsNoTracking()
            .Include(t => t.Tags)
            .FirstAsync(t => t.Id == textureSetId);
        Assert.Empty(textureSet.Tags);
        Assert.Null(textureSet.TextureSetCategoryId);
        Assert.Null(await StoredMetadataAsync("TextureSet", textureSetId));
    }

    [Fact]
    public async Task A_Cross_Kind_Category_On_A_Texture_Set_Changes_Nothing()
    {
        // Global Materials (Universal) and Multi-Model Textures (ModelSpecific) are separate
        // asset types that never share a vocabulary. Handing one the other's category is a
        // refusal, and the tags in the same patch must not survive it.
        var (textureSetId, _) = await SeedTextureSetAsync(TextureSetKind.ModelSpecific);
        var wrongKind = await SeedTextureSetCategoryAsync(TextureSetKind.Universal);

        var result = await PatchAsync("TextureSet", textureSetId, new Dictionary<string, object?>
        {
            ["tags"] = new[] { "stone" },
            ["category"] = wrongKind,
            ["licenseName"] = "CC0",
        });

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryKindMismatch", result.Error.Code);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var textureSet = await db.TextureSets.AsNoTracking().Include(t => t.Tags)
            .FirstAsync(t => t.Id == textureSetId);
        Assert.Empty(textureSet.Tags);
        Assert.Null(textureSet.TextureSetCategoryId);
        Assert.Null(await StoredMetadataAsync("TextureSet", textureSetId));
    }

    [Fact]
    public async Task A_Cross_Kind_Category_On_A_Material_Changes_Nothing()
    {
        // Materials borrow the texture-set tree and need the Universal half of it. Their
        // patch is two commands as well - tags, then description and category together.
        var materialId = await SeedMaterialAsync();
        var wrongKind = await SeedTextureSetCategoryAsync(TextureSetKind.ModelSpecific);

        var result = await PatchAsync("Material", materialId, new Dictionary<string, object?>
        {
            ["tags"] = new[] { "brass" },
            ["description"] = "polished brass",
            ["category"] = wrongKind,
        });

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryKindMismatch", result.Error.Code);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var material = await db.Materials.AsNoTracking().Include(m => m.Tags)
            .FirstAsync(m => m.Id == materialId);
        Assert.Empty(material.Tags);
        Assert.Null(material.Description);
        Assert.Null(material.CategoryId);
    }

    // ─── And the path that is supposed to work ───────────────────────

    [Fact]
    public async Task A_Mixed_Entity_And_Side_Table_Patch_Commits_Together()
    {
        // Atomicity that only ever rolls back is a bug of its own. Every half of a good
        // patch has to be durable after it, in the same transaction.
        var (textureSetId, categoryId) = await SeedTextureSetAsync(TextureSetKind.ModelSpecific);

        var result = await PatchAsync("TextureSet", textureSetId, new Dictionary<string, object?>
        {
            ["tags"] = new[] { "stone", "wall" },
            ["category"] = categoryId,
            ["licenseName"] = "CC0 1.0 Universal",
            ["author"] = "Kenney",
        });

        Assert.True(result.IsSuccess);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var textureSet = await db.TextureSets.AsNoTracking().Include(t => t.Tags)
            .FirstAsync(t => t.Id == textureSetId);
        Assert.Equal(2, textureSet.Tags.Count);
        Assert.Equal(categoryId, textureSet.TextureSetCategoryId);

        var stored = await StoredMetadataAsync("TextureSet", textureSetId);
        Assert.NotNull(stored);
        Assert.Equal("CC0 1.0 Universal", stored!.LicenseName);
        Assert.Equal("Kenney", stored.Author);
    }

    [Fact]
    public async Task A_Model_Patch_Still_Writes_Entity_And_Side_Table_In_One_Go()
    {
        var (modelId, categoryId) = await SeedModelAsync();

        var result = await PatchAsync("Model", modelId, new Dictionary<string, object?>
        {
            ["tags"] = new[] { "wood", "crate" },
            ["description"] = "a crate",
            ["category"] = categoryId,
            ["licenseName"] = "CC0 1.0 Universal",
        });

        Assert.True(result.IsSuccess);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var model = await db.Models.AsNoTracking().Include(m => m.Tags).FirstAsync(m => m.Id == modelId);
        Assert.Equal(2, model.Tags.Count);
        Assert.Equal("a crate", model.Description);
        Assert.Equal(categoryId, model.ModelCategoryId);
        Assert.Equal("CC0 1.0 Universal", (await StoredMetadataAsync("Model", modelId))!.LicenseName);
    }

    [Fact]
    public async Task Filtered_Unique_Index_Enforces_Store_Item_Provenance_Uniqueness()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTime.UtcNow;

        var (modelAId, _) = await SeedModelAsync();
        var (modelBId, _) = await SeedModelAsync();

        var metaA = AssetMetadata.Create("Model", modelAId, 1, now);
        metaA.SetProvenance("Store Import", null, "https://store.example.com", "pack-1", "item-duplicate-1", now, now);
        db.AssetMetadata.Add(metaA);
        await db.SaveChangesAsync();

        var metaB = AssetMetadata.Create("Model", modelBId, 1, now);
        metaB.SetProvenance("Store Import", null, "https://store.example.com", "pack-1", "item-duplicate-1", now, now);
        db.AssetMetadata.Add(metaB);

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.NotNull(ex.InnerException);
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private static IReadOnlyDictionary<string, JsonElement> Fields(Dictionary<string, object?> fields)
    {
        var json = JsonSerializer.SerializeToElement(fields);
        return json.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone(), StringComparer.Ordinal);
    }

    private async Task<Result<AssetMetadataResponse>> PatchAsync(
        string assetType, int assetId, Dictionary<string, object?> fields)
    {
        using var scope = _factory.Services.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse>>();
        return await handler.Handle(
            new SetAssetMetadataCommand(assetType, assetId, Fields(fields)), CancellationToken.None);
    }

    /// <summary>
    /// The real handler with every real dependency, and one hook between the validation and
    /// the write - the window a concurrent delete lives in, which cannot be reached from
    /// outside because it is closed within a single call.
    /// </summary>
    private static SetAssetMetadataCommandHandler HandlerWithHook(
        IServiceScope scope, Func<Task> onAfterValidation)
    {
        var sp = scope.ServiceProvider;
        return new SetAssetMetadataCommandHandler(
            new HookedEntityMetadata(sp.GetRequiredService<IAssetEntityMetadata>(), onAfterValidation),
            sp.GetRequiredService<IAssetMetadataRepository>(),
            sp.GetRequiredService<IAssetSearchDocumentRepository>(),
            sp.GetRequiredService<IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse>>(),
            sp.GetRequiredService<IDateTimeProvider>(),
            sp.GetRequiredService<IUnitOfWork>());
    }

    private sealed class HookedEntityMetadata(IAssetEntityMetadata inner, Func<Task> afterValidation)
        : IAssetEntityMetadata
    {
        public Task<Result<AssetEntityMetadataState>> ReadAsync(
            string family, int assetId, CancellationToken cancellationToken) =>
            inner.ReadAsync(family, assetId, cancellationToken);

        public async Task<Result> ValidateWriteAsync(
            string family, int assetId, AssetEntityMetadataWrite write, CancellationToken cancellationToken)
        {
            var result = await inner.ValidateWriteAsync(family, assetId, write, cancellationToken);
            await afterValidation();
            return result;
        }

        public Task<Result> WriteAsync(
            string family, int assetId, AssetEntityMetadataWrite write, CancellationToken cancellationToken) =>
            inner.WriteAsync(family, assetId, write, cancellationToken);
    }

    private async Task<(int ModelId, int CategoryId)> SeedModelAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTime.UtcNow;

        var category = ModelCategory.Create($"Crates-{Guid.NewGuid():N}", null, null, now);
        var model = Model.Create($"crate-{Guid.NewGuid():N}", now);
        db.ModelCategories.Add(category);
        db.Models.Add(model);
        await db.SaveChangesAsync();

        return (model.Id, category.Id);
    }

    private async Task<(int TextureSetId, int CategoryId)> SeedTextureSetAsync(TextureSetKind kind)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTime.UtcNow;

        var category = TextureSetCategory.Create($"Stone-{Guid.NewGuid():N}", null, null, kind, now);
        var textureSet = TextureSet.Create($"stone-{Guid.NewGuid():N}", now, kind);
        db.TextureSetCategories.Add(category);
        db.TextureSets.Add(textureSet);
        await db.SaveChangesAsync();

        return (textureSet.Id, category.Id);
    }

    private async Task<int> SeedTextureSetCategoryAsync(TextureSetKind kind)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var category = TextureSetCategory.Create(
            $"Kind-{Guid.NewGuid():N}", null, null, kind, DateTime.UtcNow);
        db.TextureSetCategories.Add(category);
        await db.SaveChangesAsync();
        return category.Id;
    }

    private async Task<int> SeedMaterialAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var material = Material.Create(
            $"brass-{Guid.NewGuid():N}", MaterialParameters.Default, DateTime.UtcNow);
        db.Materials.Add(material);
        await db.SaveChangesAsync();
        return material.Id;
    }

    private async Task AssertModelUntouchedAsync(int modelId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var model = await db.Models.AsNoTracking().Include(m => m.Tags).FirstAsync(m => m.Id == modelId);

        Assert.Empty(model.Tags);
        Assert.Null(model.Description);
        Assert.Null(model.ModelCategoryId);
    }

    private async Task<AssetMetadata?> StoredMetadataAsync(string family, int assetId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.AssetMetadata
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.AssetType == family && m.AssetId == assetId);
    }
}
