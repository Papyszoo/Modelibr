using System.Net.Http.Json;
using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Covers the regression from PR #568 (feat/unit-of-work): once repositories
/// stopped self-committing (see the backend-patterns skill, "Transactions -
/// unit of work"), a handler that calls AddAsync and then, in the same
/// request, mutates and UpdateAsync's the SAME aggregate before the first
/// SaveChanges hands back an entity still tracked as Added with a temporary
/// (not yet DB-assigned) key. A repository UpdateAsync that unconditionally
/// called <c>_context.Set&lt;T&gt;().Update(entity)</c> forced that entity's
/// state to Modified while the key was still temporary, which EF Core rejects
/// with: "The property '{Entity}.Id' has a temporary value while attempting
/// to change the entity's state to 'Modified'." CreateTextureSetWithFileCommand
/// hit this in production (uploading a texture set via the UI 500'd). The fix
/// is repository-level: <see cref="Infrastructure.Persistence.DbContextTrackingExtensions.UpdateIfDetached{TEntity}"/>
/// only calls Update() when the entity is genuinely Detached - an
/// already-tracked entity (Added or otherwise) is persisted in its current
/// state by the next SaveChangesAsync with no extra call needed.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class RepositoryUpdateTrackingTests : IClassFixture<ModelibrWebFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    // Minimal valid 1x1 transparent PNG - real bytes so the handler's
    // best-effort image-metadata read (ImageDimensionReader) has something
    // decodable to work with, though it degrades gracefully either way.
    private static readonly byte[] MinimalPngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");

    private readonly ModelibrWebFactory _factory;
    private readonly HttpClient _client;

    public RepositoryUpdateTrackingTests(ModelibrWebFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    // ─── The exact regressed flow: CreateTextureSetWithFileCommand ──────

    [Fact]
    public async Task CreateTextureSetWithFile_Endpoint_PersistsSetWithTexture()
    {
        // Arrange: exactly the multipart shape the frontend upload sends to
        // POST /texture-sets/with-file (CreateTextureSetWithFileCommandHandler:
        // AddAsync(textureSet) -> AddTexture(...) -> UpdateAsync(textureSet) ->
        // ONE SaveChanges). Before the fix this 500'd inside SaveChangesAsync.
        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(MinimalPngBytes);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        var setName = $"regression-texture-set-{Guid.NewGuid():N}";
        form.Add(fileContent, "file", $"{setName}.png");
        form.Add(new StringContent(setName), "name");
        form.Add(new StringContent("Albedo"), "textureType");

        // Act
        var response = await _client.PostAsync("/texture-sets/with-file", form);
        var body = await response.Content.ReadAsStringAsync();

        // Assert: no 500, the set and its texture both got real, persisted ids.
        Assert.True(response.IsSuccessStatusCode,
            $"Expected the upload to succeed but got {response.StatusCode}: {body}");

        var created = JsonSerializer.Deserialize<JsonElement>(body, JsonOpts);
        var textureSetId = created.GetProperty("textureSetId").GetInt32();
        var textureId = created.GetProperty("textureId").GetInt32();
        Assert.True(textureSetId > 0, "TextureSetId should be a real, database-assigned id.");
        Assert.True(textureId > 0, "TextureId should be a real, database-assigned id.");

        // Assert: it's actually durable - read it back through a plain GET.
        var getResponse = await _client.GetAsync($"/texture-sets/{textureSetId}");
        getResponse.EnsureSuccessStatusCode();
        var getJson = await getResponse.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        var textures = getJson.GetProperty("textures");
        Assert.Equal(1, textures.GetArrayLength());
        Assert.Equal(setName, getJson.GetProperty("name").GetString());
    }

    // ─── A second Add→Update flow, different repository/aggregate ───────

    [Fact]
    public async Task AddAsync_Then_UpdateAsync_SameModel_BeforeSaveChanges_PersistsWithoutThrowing()
    {
        // Proves the fix is repository-level, not a one-off patch of
        // TextureSetRepository: reproduce the exact same shape (Add -> mutate
        // -> Update on the SAME tracked reference -> one SaveChanges) against
        // ModelRepository, a completely different aggregate. No production
        // handler happens to chain Model's Add and Update quite this tightly
        // today (CreateModelVersionCommandHandler/AddModelCommandHandler
        // interleave a SaveChanges in between, which sidesteps the temporary
        // key), but the repository bug - and the fix - applied to every
        // repository under src/Infrastructure/Repositories equally.
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var modelRepository = scope.ServiceProvider.GetRequiredService<IModelRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var originalName = $"add-then-update-{Guid.NewGuid():N}";
        var renamedName = $"{originalName}-renamed";

        var added = await modelRepository.AddAsync(Model.Create(originalName, DateTime.UtcNow));
        added.UpdateName(renamedName, DateTime.UtcNow);

        // Before the fix, this UpdateAsync call - on the same still-Added,
        // temporary-keyed entity - would have forced EF to try to move it to
        // Modified and throw. It must not throw now.
        await modelRepository.UpdateAsync(added);
        await unitOfWork.SaveChangesAsync();

        // Assert: persisted with the mutation applied, verified from a fresh
        // scope/DbContext so there's no chance of reading back still-tracked
        // in-memory state.
        using var verifyScope = _factory.Services.CreateScope();
        var verifyRepository = verifyScope.ServiceProvider.GetRequiredService<IModelRepository>();
        var persisted = await verifyRepository.GetByIdAsync(added.Id);

        Assert.NotNull(persisted);
        Assert.Equal(renamedName, persisted!.Name);
    }

    // ─── The reverse hazard: a genuinely detached entity must still update ─

    [Fact]
    public async Task UpdateAsync_DetachedEntity_PersistsModification()
    {
        // The repo-level guard (UpdateIfDetached) only skips the explicit
        // Update() call when the CURRENT context already tracks the entity.
        // A genuinely detached instance - loaded via AsNoTracking, or
        // reconstructed in a different scope/request - must still be
        // attached and marked Modified so SaveChanges persists it. This is
        // "what Update() is for"; the fix must not turn it into a no-op.
        using var seedScope = _factory.Services.CreateScope();
        var seedContext = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await seedContext.Database.MigrateAsync();
        var seedRepository = seedScope.ServiceProvider.GetRequiredService<IModelRepository>();
        var seedUnitOfWork = seedScope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var originalName = $"detached-update-{Guid.NewGuid():N}";
        var seeded = await seedRepository.AddAsync(Model.Create(originalName, DateTime.UtcNow));
        await seedUnitOfWork.SaveChangesAsync();
        var modelId = seeded.Id;

        // Load a genuinely detached copy from a separate, short-lived
        // DbContext/scope (AsNoTracking, then the scope is disposed).
        Model detached;
        using (var loadScope = _factory.Services.CreateScope())
        {
            var loadContext = loadScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            detached = await loadContext.Models.AsNoTracking().FirstAsync(m => m.Id == modelId);
        }

        var renamedName = $"{originalName}-detached-renamed";
        detached.UpdateName(renamedName, DateTime.UtcNow);

        using var updateScope = _factory.Services.CreateScope();
        var updateRepository = updateScope.ServiceProvider.GetRequiredService<IModelRepository>();
        var updateUnitOfWork = updateScope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        await updateRepository.UpdateAsync(detached);
        await updateUnitOfWork.SaveChangesAsync();

        using var verifyScope = _factory.Services.CreateScope();
        var verifyRepository = verifyScope.ServiceProvider.GetRequiredService<IModelRepository>();
        var persisted = await verifyRepository.GetByIdAsync(modelId);

        Assert.NotNull(persisted);
        Assert.Equal(renamedName, persisted!.Name);
    }
}
