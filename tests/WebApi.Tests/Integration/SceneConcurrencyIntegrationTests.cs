using Application.Abstractions.Messaging;
using Application.Scenes;
using Domain.Scenes;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// A scene's revision as a database concurrency token.
///
/// This has to be an integration test: the revision check inside the writer compares against
/// the entity <i>this request</i> loaded, so with mocks - or with two writes issued one after
/// the other - it passes every time. The lost update only appears when two scopes hold their
/// own copy of the same scene at revision N and both try to store N+1, which is exactly what
/// two browser tabs, or a user and an agent, do. Before the token, the second write silently
/// replaced the first and reported success to both.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class SceneConcurrencyIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;

    public SceneConcurrencyIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    // Idempotent re-migrate before any fact runs - see the note in ConcurrencyTests for why
    // the classes sharing this collection cannot rely on the app's startup migration alone.
    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<int> CreateSceneAsync(string name)
    {
        using var scope = _factory.Services.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<ICommandHandler<CreateSceneCommand, SceneView>>();

        var created = await handler.Handle(new CreateSceneCommand(name, null, null), CancellationToken.None);
        Assert.True(created.IsSuccess);
        return created.Value.Scene.Id;
    }

    /// <summary>A document holding one light, so the two racing writes are distinguishable.</summary>
    private static string DocumentWithLight(string lightId) =>
        SceneDocumentCodec.Serialize(SceneDocument.Empty() with
        {
            Lights = new[] { new SceneLight(lightId, SceneLightTypes.Point, new Vec3(0, 3, 0)) },
        });

    [Fact]
    public async Task Two_Writers_Holding_The_Same_Revision_Cannot_Both_Land()
    {
        var sceneId = await CreateSceneAsync($"race-{Guid.NewGuid():N}");

        // Two scopes, as two requests would be. Both load the scene at the same revision
        // before either one writes - the interleaving that makes an in-memory check useless.
        using var first = _factory.Services.CreateScope();
        using var second = _factory.Services.CreateScope();

        var firstWriter = first.ServiceProvider.GetRequiredService<ISceneWriter>();
        var secondWriter = second.ServiceProvider.GetRequiredService<ISceneWriter>();

        var firstLoaded = await firstWriter.LoadAsync(sceneId);
        var secondLoaded = await secondWriter.LoadAsync(sceneId);
        Assert.True(firstLoaded.IsSuccess);
        Assert.True(secondLoaded.IsSuccess);
        Assert.Equal(firstLoaded.Value.Scene.Revision, secondLoaded.Value.Scene.Revision);

        var firstWrite = await firstWriter.ApplyAsync(
            sceneId, null, _ => SceneDocumentCodec.Parse(DocumentWithLight("from-first")));
        var secondWrite = await secondWriter.ApplyAsync(
            sceneId, null, _ => SceneDocumentCodec.Parse(DocumentWithLight("from-second")));

        Assert.True(firstWrite.IsSuccess);
        Assert.True(secondWrite.IsFailure);
        Assert.Equal("Scene.RevisionConflict", secondWrite.Error.Code);

        // The winner's edit is what is stored - not a blend, and not the loser's.
        using var reader = _factory.Services.CreateScope();
        var stored = await reader.ServiceProvider.GetRequiredService<ISceneWriter>().LoadAsync(sceneId);
        Assert.Equal("from-first", Assert.Single(stored.Value.Document.Lights).Id);
    }

    [Fact]
    public async Task A_Writer_That_Reloads_After_Losing_Can_Apply_Its_Change()
    {
        // The conflict has to be recoverable, or the fix would just move data loss into a
        // dead end: re-read, re-apply, and the second edit lands on top of the first.
        var sceneId = await CreateSceneAsync($"retry-{Guid.NewGuid():N}");

        using (var winner = _factory.Services.CreateScope())
        {
            var result = await winner.ServiceProvider.GetRequiredService<ISceneWriter>()
                .ApplyAsync(sceneId, null, _ => SceneDocumentCodec.Parse(DocumentWithLight("from-first")));
            Assert.True(result.IsSuccess);
        }

        using var retry = _factory.Services.CreateScope();
        var applied = await retry.ServiceProvider.GetRequiredService<ISceneWriter>()
            .ApplyAsync(sceneId, null, _ => SceneDocumentCodec.Parse(DocumentWithLight("from-second")));

        Assert.True(applied.IsSuccess);
        Assert.Equal("from-second", Assert.Single(applied.Value.Document.Lights).Id);
    }
}
