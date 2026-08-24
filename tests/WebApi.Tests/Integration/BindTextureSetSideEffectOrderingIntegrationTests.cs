using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Agents;
using Application.Models;
using Application.TextureSets;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// <c>bind_texture_set</c>'s side effects, timed against the transaction they describe.
/// </summary>
/// <remarks>
/// <para>
/// The database writes were made atomic first: associate + set-default run inside one
/// transaction, and a failing default rolls the association back. What stayed outside that
/// boundary was everything the write TELLS somebody about - the generated <c>.blend</c> cache
/// invalidation, the regeneration enqueue and the thumbnail worker notification - all of them
/// issued from inside the transaction, before it committed.
/// </para>
/// <para>
/// That is not a timing nicety. The blend generation queue is a singleton whose consumer
/// opens its OWN database scope, so the sequence available to it was: take the entry, read the
/// bindings this transaction has not committed, generate a <c>.blend</c> from the ones being
/// replaced, and cache it - after which the second, post-commit entry for the same version
/// finds a cache file already sitting there and returns it. The user gets a <c>.blend</c>
/// built from the binding they just replaced, and a rollback emits the same effects for a
/// bind that never happened.
/// </para>
/// <para>
/// Nothing below a real database can show this. The observation these tests make is the one
/// the consumer makes: at the moment the enqueue arrives, open a SEPARATE scope - a separate
/// connection - and read what is committed. Under an open transaction that read sees the old
/// state, and it is deterministic: PostgreSQL readers do not block on uncommitted writers,
/// they simply do not see them. No sleeps, and no assumption about who is faster.
/// </para>
/// </remarks>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class BindTextureSetSideEffectOrderingIntegrationTests
    : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;
    private readonly SideEffectObserver _observer = new();
    private WebApplicationFactory<Program> _host = null!;

    public BindTextureSetSideEffectOrderingIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        // Same database, a host whose blend queue, blend generator and worker notifier are
        // the observer. WithWebHostBuilder rather than a second ModelibrWebFactory: the
        // factory drops and recreates the database in its constructor.
        _host = _factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IBlendFileGenerationQueue>();
            services.RemoveAll<IBlendFileGenerator>();
            services.RemoveAll<IThumbnailJobQueueNotificationService>();

            services.AddSingleton<IBlendFileGenerationQueue>(sp =>
            {
                _observer.Scopes = sp.GetRequiredService<IServiceScopeFactory>();
                return _observer;
            });
            services.AddSingleton<IBlendFileGenerator>(sp =>
            {
                _observer.Scopes = sp.GetRequiredService<IServiceScopeFactory>();
                return _observer;
            });
            services.AddScoped<IThumbnailJobQueueNotificationService>(_ => _observer);
        }));

        using var scope = _host.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    public Task DisposeAsync()
    {
        _host.Dispose();
        return Task.CompletedTask;
    }

    // ─── the successful bind ─────────────────────────────────────────

    [Fact]
    public async Task A_Successful_Bind_Emits_Its_Side_Effects_Only_After_The_Commit()
    {
        var (modelId, versionId) = await SeedModelWithActiveVersionAsync();
        var textureSetId = await SeedTextureSetAsync();

        var result = await BindAsync(textureSetId, modelId, "bind-effects-ok");
        Assert.Contains("\"ok\"", JsonSerializer.Serialize(result));

        // The effects happened at all - without this, "they saw the new state" is equally
        // consistent with them never running.
        Assert.NotEmpty(_observer.Enqueued);
        Assert.NotEmpty(_observer.Invalidated);
        Assert.NotEmpty(_observer.Notified);

        // And every one of them, looking from its own connection at the moment it was
        // handed the work, saw the binding this call made. Before the fix each of these
        // observations was of the state the bind was replacing.
        Assert.All(_observer.Enqueued, seen =>
        {
            Assert.True(seen.MappingCommitted);
            Assert.Equal(textureSetId, seen.DefaultTextureSetId);
        });
        Assert.All(_observer.Invalidated, seen => Assert.True(seen.MappingCommitted));
        Assert.All(_observer.Notified, seen => Assert.True(seen.MappingCommitted));

        // The version really is bound, so the observations above are about a real write.
        using var scope = _host.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var version = await context.ModelVersions.AsNoTracking()
            .Include(v => v.TextureMappings)
            .SingleAsync(v => v.Id == versionId);
        Assert.Contains(version.TextureMappings, m => m.TextureSetId == textureSetId);
        Assert.Equal(textureSetId, version.DefaultTextureSetId);
    }

    [Fact]
    public async Task The_Cache_Cannot_Hold_An_Artifact_Built_Before_The_Commit()
    {
        // The concrete harm, stated as the ordering that causes it. The generator's
        // invalidation and the queue entry that follows it are both post-commit, so there is
        // no moment at which a consumer can read the pre-commit bindings, write a cache file
        // from them, and have the later entry return that file as current.
        var (modelId, versionId) = await SeedModelWithActiveVersionAsync();
        var textureSetId = await SeedTextureSetAsync();

        await BindAsync(textureSetId, modelId, "bind-effects-cache");

        // Every invalidation came after the commit...
        Assert.NotEmpty(_observer.Invalidated);
        Assert.All(_observer.Invalidated, seen => Assert.True(seen.MappingCommitted));

        // ...and every generation request came after its version's invalidation, so nothing
        // a consumer could have cached from the old state survives into the new one.
        var firstInvalidation = _observer.Effects.FindIndex(
            e => e.Kind == EffectKind.Invalidate && e.VersionId == versionId);
        var firstEnqueue = _observer.Effects.FindIndex(
            e => e.Kind == EffectKind.Enqueue && e.VersionId == versionId);
        Assert.True(firstInvalidation >= 0 && firstEnqueue >= 0);
        Assert.True(firstInvalidation < firstEnqueue);
    }

    // ─── the failing bind ────────────────────────────────────────────

    [Fact]
    public async Task A_Failed_Default_Rolls_The_Write_Back_And_Emits_No_Side_Effects()
    {
        // A model with a version but no ACTIVE version: associating succeeds, setting the
        // default answers NoActiveVersion, and the transaction rolls back. The effects the
        // association asked for describe a write that no longer exists.
        var (modelId, versionId) = await SeedModelWithInactiveVersionAsync();
        var textureSetId = await SeedTextureSetAsync();

        var result = await BindAsync(textureSetId, modelId, "bind-effects-rollback");
        Assert.Contains("NoActiveVersion", JsonSerializer.Serialize(result));

        Assert.Empty(_observer.Enqueued);
        Assert.Empty(_observer.Invalidated);
        Assert.Empty(_observer.Notified);

        using var scope = _host.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var version = await context.ModelVersions.AsNoTracking()
            .Include(v => v.TextureMappings)
            .SingleAsync(v => v.Id == versionId);
        Assert.Empty(version.TextureMappings);
    }

    [Fact]
    public async Task A_Failed_Bind_Leaves_The_Idempotency_Key_Retryable_And_The_Retry_Applies()
    {
        // The claim goes back on failure, which is only honest because nothing survived -
        // neither in the database nor as a side effect. Proven end to end: the same key is
        // taken up again by a corrected retry, and THAT one emits the effects.
        var (modelId, _) = await SeedModelWithInactiveVersionAsync();
        var textureSetId = await SeedTextureSetAsync();
        const string key = "bind-effects-retry";

        var failed = await BindAsync(textureSetId, modelId, key);
        Assert.Contains("NoActiveVersion", JsonSerializer.Serialize(failed));

        using (var scope = _host.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            // No COMPLETED audit entry describes the write, so the key is free - which is
            // only a truthful answer because the rollback above left nothing behind.
            Assert.Empty(await context.AgentOperationLogs
                .Where(l => l.IdempotencyKey == key && l.Status == AgentOperationStatus.Completed)
                .ToListAsync());
        }

        // The condition that made it fail is corrected, and the key is reused.
        await ActivateFirstVersionAsync(modelId);
        _observer.Reset();

        var retried = await BindAsync(textureSetId, modelId, key);
        Assert.Contains("\"ok\"", JsonSerializer.Serialize(retried));
        Assert.NotEmpty(_observer.Enqueued);
        Assert.All(_observer.Enqueued, seen => Assert.True(seen.MappingCommitted));
    }

    // ─── harness ─────────────────────────────────────────────────────

    private async Task<object> BindAsync(int textureSetId, int modelId, string idempotencyKey)
    {
        using var scope = _host.Services.CreateScope();
        var sp = scope.ServiceProvider;

        _observer.Watch(textureSetId);

        return await AssetImportMcpTools.BindTextureSet(
            sp.GetRequiredService<ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>>(),
            sp.GetRequiredService<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>>(),
            sp.GetRequiredService<IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot>>(),
            sp.GetRequiredService<Application.Abstractions.IUnitOfWork>(),
            sp.GetRequiredService<IAgentAudit>(),
            McpCallerContext.Unauthenticated(),
            textureSetId,
            modelId,
            idempotencyKey);
    }

    private async Task<(int ModelId, int VersionId)> SeedModelWithActiveVersionAsync()
    {
        var (modelId, versionId) = await SeedModelWithInactiveVersionAsync();
        await ActivateFirstVersionAsync(modelId);
        return (modelId, versionId);
    }

    private async Task<(int ModelId, int VersionId)> SeedModelWithInactiveVersionAsync()
    {
        using var scope = _host.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTime.UtcNow;

        var model = Model.Create($"bind-effects-{Guid.NewGuid():N}", now);
        context.Models.Add(model);
        await context.SaveChangesAsync();

        var version = ModelVersion.Create(model.Id, 1, "seed", now);
        var file = Domain.Models.File.Create(
            "seed.glb",
            $"{Guid.NewGuid():N}.glb",
            $"/tmp/{Guid.NewGuid():N}.glb",
            "model/gltf-binary",
            FileType.Glb,
            1024,
            Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            now);
        version.AddFile(file);
        context.ModelVersions.Add(version);
        await context.SaveChangesAsync();

        return (model.Id, version.Id);
    }

    private async Task ActivateFirstVersionAsync(int modelId)
    {
        using var scope = _host.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var model = await context.Models.SingleAsync(m => m.Id == modelId);
        var version = await context.ModelVersions.Where(v => v.ModelId == modelId)
            .OrderBy(v => v.Id).FirstAsync();
        model.SetActiveVersion(version.Id, DateTime.UtcNow);
        await context.SaveChangesAsync();
    }

    private async Task<int> SeedTextureSetAsync()
    {
        using var scope = _host.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var textureSet = TextureSet.Create(
            $"bind-effects-set-{Guid.NewGuid():N}", DateTime.UtcNow, TextureSetKind.ModelSpecific);
        context.TextureSets.Add(textureSet);
        await context.SaveChangesAsync();
        return textureSet.Id;
    }

    private enum EffectKind
    {
        Invalidate,
        Enqueue,
        NotifyWorker,
    }

    /// <summary>What one separate database scope could see at the instant an effect fired.</summary>
    private sealed record Observation(
        EffectKind Kind,
        int VersionId,
        bool MappingCommitted,
        int? DefaultTextureSetId);

    /// <summary>
    /// Stands in for the three consumers, and does what the real ones do first: opens its own
    /// scope and reads the database. Whatever it sees is what the write had actually published
    /// at that moment.
    /// </summary>
    private sealed class SideEffectObserver
        : IBlendFileGenerationQueue, IBlendFileGenerator, IThumbnailJobQueueNotificationService
    {
        private int _watchedTextureSetId;

        public IServiceScopeFactory Scopes { get; set; } = null!;

        public List<Observation> Effects { get; } = [];

        public List<Observation> Enqueued => Effects.FindAll(e => e.Kind == EffectKind.Enqueue);

        public List<Observation> Invalidated => Effects.FindAll(e => e.Kind == EffectKind.Invalidate);

        public List<Observation> Notified => Effects.FindAll(e => e.Kind == EffectKind.NotifyWorker);

        public void Watch(int textureSetId) => _watchedTextureSetId = textureSetId;

        public void Reset() => Effects.Clear();

        // IBlendFileGenerationQueue
        public void Enqueue(int modelId, int versionId) => Record(EffectKind.Enqueue, versionId);

        // IBlendFileGenerator - only InvalidateCache is exercised here; the rest must exist.
        public bool IsAvailable => true;

        public void InvalidateCache(int modelId, int versionId) => Record(EffectKind.Invalidate, versionId);

        public long? GetCachedSizeBytes(int modelId, int versionId) => null;

        public Task<GeneratedBlendInfo?> GetOrGenerateAsync(
            int modelId, int versionId, CancellationToken cancellationToken = default)
            => Task.FromResult<GeneratedBlendInfo?>(null);

        // IThumbnailJobQueueNotificationService
        public Task NotifyJobEnqueuedAsync(ThumbnailJob job, CancellationToken cancellationToken = default)
        {
            Record(EffectKind.NotifyWorker, job.ModelVersionId ?? 0);
            return Task.CompletedTask;
        }

        public Task NotifyJobStatusChangedAsync(
            int jobId, string status, string? workerId = null, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        /// <summary>
        /// The read the consumer would make. Synchronous because the producer's call is:
        /// <c>Enqueue</c> is <c>void</c> and a channel write, and a real consumer picking the
        /// entry up immediately would be doing this on its own thread with its own connection.
        /// </summary>
        private void Record(EffectKind kind, int versionId)
        {
            using var scope = Scopes.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var version = context.ModelVersions.AsNoTracking()
                .Include(v => v.TextureMappings)
                .FirstOrDefault(v => v.Id == versionId);

            Effects.Add(new Observation(
                kind,
                versionId,
                version?.TextureMappings.Any(m => m.TextureSetId == _watchedTextureSetId) ?? false,
                version?.DefaultTextureSetId));
        }
    }
}
