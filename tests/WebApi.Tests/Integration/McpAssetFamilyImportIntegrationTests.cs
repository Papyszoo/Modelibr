using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.EnvironmentMaps;
using Application.Models;
using Application.Sounds;
using Application.TextureSets;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The write surface beyond Model. Before these tools every MCP write was Model-only, so
/// importing the 4,375-sound CC0 corpus had to bypass MCP entirely and POST to
/// <c>/sounds/with-file</c> - "an agent can do everything a user can do" was about one
/// sixth true.
///
/// Run against the real handlers and PostgreSQL rather than mocks, because the parts worth
/// proving are exactly the ones mocks would fake: that a multi-channel material lands as
/// ONE set holding every channel, and that binding a set to a model is a single call.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class McpAssetFamilyImportIntegrationTests : IClassFixture<ModelibrWebFactory>, IDisposable
{
    // Real 1x1 PNGs - the texture pipeline reads image metadata, so the bytes must decode.
    //
    // Three DISTINCT images on purpose. Files are content-addressed, so byte-identical
    // channel files collapse to one FileId and the second one violates the unique index on
    // (TextureSetId, FileId, SourceChannel). Using one image for every channel would test
    // the storage layer's dedup, not the multi-channel import.
    private static readonly byte[] RedPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC");
    private static readonly byte[] GreenPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg+M8AAAICAQB7CYF4AAAAAElFTkSuQmCC");
    private static readonly byte[] BluePng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC");

    private readonly ModelibrWebFactory _factory;
    private readonly string _scratch;

    public McpAssetFamilyImportIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
        _scratch = Directory.CreateTempSubdirectory("mcp-import-tests").FullName;
    }

    public void Dispose()
    {
        try { Directory.Delete(_scratch, recursive: true); } catch { /* best effort */ }
        GC.SuppressFinalize(this);
    }

    private async Task MigrateAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    private string WriteFile(string name, byte[]? bytes = null)
    {
        var path = Path.Combine(_scratch, name);
        File.WriteAllBytes(path, bytes ?? RedPng);
        return path;
    }

    private static string Json(object value) => JsonSerializer.Serialize(value);

    [Fact]
    public async Task ImportSound_CreatesTheSound_RecordsAudit_AndIsIdempotentOnRetry()
    {
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var key = $"mcp-import-sound-{suffix}";
        var name = $"agent-sound-{suffix}";

        // A minimal RIFF/WAVE header. Import stores bytes and defers duration to the
        // waveform job, so this only has to be a plausible .wav, not playable audio.
        var wav = new byte[44];
        "RIFF"u8.CopyTo(wav.AsSpan(0));
        "WAVE"u8.CopyTo(wav.AsSpan(8));
        var path = WriteFile($"{name}.wav", wav);

        int soundId;
        using (var scope = _factory.Services.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var result = await AssetImportMcpTools.ImportSound(
                sp.GetRequiredService<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>(),
                sp.GetRequiredService<IAgentAudit>(),
                McpCallerContext.Unauthenticated(),
                path,
                key,
                name);

            Assert.Contains("\"ok\"", Json(result));

            var sound = await sp.GetRequiredService<ApplicationDbContext>().Sounds
                .SingleAsync(s => s.Name == name);
            soundId = sound.Id;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var log = Assert.Single(await context.AgentOperationLogs.Where(l => l.IdempotencyKey == key).ToListAsync());
            Assert.Equal("import-sound", log.Operation);
            Assert.Equal("Sound", log.AssetType);
            Assert.Equal(soundId, log.AssetId);
        }

        // Retry with the same key: short-circuited before the handler runs, so no second sound.
        using (var scope = _factory.Services.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var retry = await AssetImportMcpTools.ImportSound(
                sp.GetRequiredService<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>(),
                sp.GetRequiredService<IAgentAudit>(),
                McpCallerContext.Unauthenticated(),
                path,
                key,
                name);

            Assert.Contains("already-applied", Json(retry));

            var context = sp.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(1, await context.Sounds.CountAsync(s => s.Name == name));
        }
    }

    [Fact]
    public async Task ImportTextureSet_LandsEveryChannelInOneSet()
    {
        // The capability that did not exist: a material is 4-6 channel files, and only the
        // first had a home. Adding a channel needed a fileId that could only come from a
        // prior upload through some other path, which is why 51 staged ambientCG materials
        // were never imported.
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var setName = $"agent-material-{suffix}";

        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;

        var result = await AssetImportMcpTools.ImportTextureSet(
            sp.GetRequiredService<ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse>>(),
            sp.GetRequiredService<ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse>>(),
            sp.GetRequiredService<IAgentAudit>(),
            McpCallerContext.Unauthenticated(),
            setName,
            [
                new AssetImportMcpTools.TextureChannelImport(WriteFile($"{suffix}-albedo.png", RedPng), "Albedo"),
                // Lower-cased on purpose: an agent should not have to match our casing.
                new AssetImportMcpTools.TextureChannelImport(WriteFile($"{suffix}-normal.png", GreenPng), "normal"),
                new AssetImportMcpTools.TextureChannelImport(WriteFile($"{suffix}-rough.png", BluePng), "Roughness"),
            ],
            $"mcp-import-texture-set-{suffix}");

        Assert.Contains("\"ok\"", Json(result));

        var context = sp.GetRequiredService<ApplicationDbContext>();
        var set = await context.TextureSets
            .Include(s => s.Textures)
            .SingleAsync(s => s.Name == setName);

        Assert.Equal(3, set.Textures.Count);
        Assert.Contains(set.Textures, t => t.TextureType == Domain.ValueObjects.TextureType.Albedo);
        Assert.Contains(set.Textures, t => t.TextureType == Domain.ValueObjects.TextureType.Normal);
        Assert.Contains(set.Textures, t => t.TextureType == Domain.ValueObjects.TextureType.Roughness);
    }

    [Fact]
    public async Task ImportTextureSet_WithAnUnknownChannelName_ReturnsTheValidVocabulary()
    {
        // An agent that guesses "Metalness" should get the vocabulary back and recover in
        // the same turn, rather than a bare parse failure.
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;

        var result = await AssetImportMcpTools.ImportTextureSet(
            sp.GetRequiredService<ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse>>(),
            sp.GetRequiredService<ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse>>(),
            sp.GetRequiredService<IAgentAudit>(),
            McpCallerContext.Unauthenticated(),
            $"never-created-{suffix}",
            [new AssetImportMcpTools.TextureChannelImport(WriteFile($"{suffix}-x.png"), "Metalness")],
            $"mcp-bad-channel-{suffix}");

        var json = Json(result);
        Assert.Contains("InvalidTextureType", json);
        Assert.Contains("Metallic", json);

        // Nothing was created, and the claim was released so the key stays usable.
        var context = sp.GetRequiredService<ApplicationDbContext>();
        Assert.False(await context.TextureSets.AnyAsync(s => s.Name == $"never-created-{suffix}"));
    }

    [Fact]
    public async Task BindTextureSet_AssociatesTheSetAndMakesItTheModelsDefault()
    {
        // The two-step the UI does manually: associate with every version, then set the
        // default. Scenes cannot ship without it - a placed model with no bound material
        // renders untextured.
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;
        var context = sp.GetRequiredService<ApplicationDbContext>();

        var created = await AssetImportMcpTools.ImportTextureSet(
            sp.GetRequiredService<ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse>>(),
            sp.GetRequiredService<ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse>>(),
            sp.GetRequiredService<IAgentAudit>(),
            McpCallerContext.Unauthenticated(),
            $"bind-material-{suffix}",
            [new AssetImportMcpTools.TextureChannelImport(WriteFile($"{suffix}-bind.png"), "Albedo")],
            $"mcp-bind-set-{suffix}");
        Assert.Contains("\"ok\"", Json(created));

        var set = await context.TextureSets.SingleAsync(s => s.Name == $"bind-material-{suffix}");

        // The model needs a version: binding associates the set with EVERY version, and a
        // versionless model correctly reports NoVersionsFound - there is nothing to bind to.
        var model = Domain.Models.Model.Create($"bind-model-{suffix}", DateTime.UtcNow);
        context.Models.Add(model);
        await context.SaveChangesAsync();
        model.CreateVersion("v1", DateTime.UtcNow);
        await context.SaveChangesAsync();

        var result = await AssetImportMcpTools.BindTextureSet(
            sp.GetRequiredService<ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>>(),
            sp.GetRequiredService<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>>(),
            sp.GetRequiredService<IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot>>(),
            sp.GetRequiredService<IAgentAudit>(),
            McpCallerContext.Unauthenticated(),
            set.Id,
            model.Id,
            $"mcp-bind-{suffix}");

        var json = Json(result);
        Assert.Contains("\"ok\"", json);
        Assert.Contains("\"isDefault\":true", json);
    }


    [Fact]
    public async Task BindTextureSet_IsUndoneAcrossEveryVersionItTouched()
    {
        // The bind writes EVERY version of the model - a mapping into each, and each one's
        // default texture set wherever that was still null. Undo recorded only the active
        // version's previous default, so reversing it reported success while leaving the
        // other versions bound to the set the agent chose. Two versions, because with one
        // the broken behaviour and the correct one are indistinguishable.
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;
        var context = sp.GetRequiredService<ApplicationDbContext>();

        var created = await AssetImportMcpTools.ImportTextureSet(
            sp.GetRequiredService<ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse>>(),
            sp.GetRequiredService<ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse>>(),
            sp.GetRequiredService<IAgentAudit>(),
            McpCallerContext.Unauthenticated(),
            $"undo-material-{suffix}",
            [new AssetImportMcpTools.TextureChannelImport(WriteFile($"{suffix}-undo.png"), "Albedo")],
            $"mcp-undo-set-{suffix}");
        Assert.Contains("\"ok\"", Json(created));

        var set = await context.TextureSets.SingleAsync(s => s.Name == $"undo-material-{suffix}");

        var model = Domain.Models.Model.Create($"undo-model-{suffix}", DateTime.UtcNow);
        context.Models.Add(model);
        await context.SaveChangesAsync();
        model.CreateVersion("v1", DateTime.UtcNow);
        model.CreateVersion("v2", DateTime.UtcNow);
        await context.SaveChangesAsync();

        var versionIds = await context.ModelVersions
            .Where(v => v.ModelId == model.Id)
            .Select(v => v.Id)
            .ToListAsync();
        Assert.Equal(2, versionIds.Count);

        var key = $"mcp-undo-bind-{suffix}";
        var bound = await AssetImportMcpTools.BindTextureSet(
            sp.GetRequiredService<ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>>(),
            sp.GetRequiredService<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>>(),
            sp.GetRequiredService<IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot>>(),
            sp.GetRequiredService<IAgentAudit>(),
            McpCallerContext.Unauthenticated(),
            set.Id,
            model.Id,
            key);
        Assert.Contains("\"ok\"", Json(bound));

        context.ChangeTracker.Clear();
        Assert.NotEmpty(await context.Set<Domain.Models.ModelVersionTextureSet>()
            .Where(m => versionIds.Contains(m.ModelVersionId) && m.TextureSetId == set.Id)
            .ToListAsync());

        var reverser = sp.GetRequiredService<IAgentOperationReverser>();
        var plan = await reverser.PlanAsync(key, null);
        Assert.True(plan.IsSuccess);
        Assert.True(plan.Value.Steps.Single().IsSupported);

        var applied = await reverser.ApplyAsync(plan.Value);
        Assert.True(applied.Value.Single().Reversed);

        // Every version, not just the active one: no mapping left, and no default left.
        context.ChangeTracker.Clear();
        Assert.Empty(await context.Set<Domain.Models.ModelVersionTextureSet>()
            .Where(m => versionIds.Contains(m.ModelVersionId) && m.TextureSetId == set.Id)
            .ToListAsync());
        Assert.All(
            await context.ModelVersions.Where(v => versionIds.Contains(v.Id)).ToListAsync(),
            version => Assert.Null(version.DefaultTextureSetId));
    }
}
