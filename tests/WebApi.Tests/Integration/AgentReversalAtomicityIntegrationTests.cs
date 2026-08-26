using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Undoing a multi-node write is several commands under ONE reversal claim.
///
/// <para>
/// <c>distribute-assets</c>, <c>place-assets-batch</c> and <c>create-room</c> each place a
/// row of nodes, and their inverse removes every one of them - through
/// <c>RemoveSceneNodeCommand</c>, which commits through the unit-of-work decorator. Three
/// of forty removed and then a failure left those three durably gone while the failure path
/// handed the reversal claim back as retryable: the next attempt re-ran an inverse that had
/// already half happened, against a scene it had already changed, and nothing anywhere said
/// so.
/// </para>
///
/// <para>
/// Real PostgreSQL, because the property being proved is that a transaction rolled back -
/// which a mocked unit of work can model but not demonstrate. What makes the later removal
/// fail is the ordinary domain rule: a node cannot be removed while something rests on it.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class AgentReversalAtomicityIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;

    public AgentReversalAtomicityIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    // Idempotent re-migrate before any fact runs - the classes sharing this collection
    // cannot rely on the app's startup migration alone (see ConcurrencyTests).
    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private static SceneNode Node(string id, SceneAnchor? anchor = null) => new(
        id,
        SceneTransform.Identity,
        Primitive: new ScenePrimitive("box", new Vec3(1, 1, 1)),
        Anchor: anchor);

    /// <summary>
    /// A scene holding a row of three boxes, with 'c' resting on 'b'.
    ///
    /// The dependent is what makes a LATER removal fail: the inverse takes the row apart in
    /// reverse order, so with the recorded ids as [b, a] it removes 'a' first (which works)
    /// and then 'b' (which cannot go while 'c' rests on it). An early success followed by a
    /// later failure is the exact shape of the bug.
    /// </summary>
    private async Task<int> CreateRowSceneAsync(string name)
    {
        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;

        var created = await sp.GetRequiredService<ICommandHandler<CreateSceneCommand, SceneView>>()
            .Handle(new CreateSceneCommand(name, null, null), CancellationToken.None);
        Assert.True(created.IsSuccess);
        var sceneId = created.Value.Scene.Id;

        var written = await sp.GetRequiredService<ISceneWriter>().ApplyAsync(
            sceneId,
            null,
            document => document with
            {
                Nodes = [Node("a"), Node("b"), Node("c", new SceneAnchor("b"))],
            });
        Assert.True(written.IsSuccess);

        return sceneId;
    }

    /// <summary>Records a completed batch placement whose inverse removes the named nodes.</summary>
    private async Task RecordBatchAsync(string key, int sceneId, string removedNodeIds)
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var entry = AgentOperationLog.Create(
            key,
            "place-assets-batch",
            DateTime.UtcNow,
            assetType: "Scene",
            assetId: sceneId,
            payloadBefore: $"{{\"removedNodeIds\":{removedNodeIds}}}");
        entry.MarkCompleted(DateTime.UtcNow, "Scene", sceneId, "{}");
        context.AgentOperationLogs.Add(entry);
        await context.SaveChangesAsync();
    }

    private static async Task<IReadOnlyList<string>> NodeIdsAsync(
        ModelibrWebFactory factory, int sceneId)
    {
        using var scope = factory.Services.CreateScope();
        var loaded = await scope.ServiceProvider.GetRequiredService<ISceneWriter>().LoadAsync(sceneId);
        Assert.True(loaded.IsSuccess);
        return loaded.Value.Document.Nodes.Select(n => n.Id).ToList();
    }

    [Fact]
    public async Task A_Row_Whose_Later_Removal_Fails_Leaves_Every_Node_In_Place()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var sceneId = await CreateRowSceneAsync($"undo-row-{suffix}");
        var key = $"undo-row-{suffix}";
        await RecordBatchAsync(key, sceneId, "[\"b\",\"a\"]");

        using var scope = _factory.Services.CreateScope();
        var reverser = scope.ServiceProvider.GetRequiredService<IAgentOperationReverser>();

        var plan = await reverser.PlanAsync(key, null);
        Assert.True(plan.IsSuccess);
        var applied = await reverser.ApplyAsync(plan.Value);

        // Reported as not reversed, with the domain's own reason.
        var step = Assert.Single(applied.Value);
        Assert.False(step.Reversed);
        Assert.Contains("rests on it", step.Detail);

        // And 'a' - which the first removal reported as gone - is still there. Without the
        // transaction it was durably removed while the caller was told nothing happened.
        Assert.Equal(["a", "b", "c"], await NodeIdsAsync(_factory, sceneId));
    }

    [Fact]
    public async Task A_Row_That_Fails_Partway_Can_Be_Undone_Again_Once_The_Blocker_Is_Gone()
    {
        // The claim goes back, and that is correct precisely because the rollback left the
        // scene untouched. Proving it is usable again is what says the release was a
        // decision rather than a leak: fix what blocked it, ask again, and the whole row
        // comes off.
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var sceneId = await CreateRowSceneAsync($"undo-retry-{suffix}");
        var key = $"undo-retry-{suffix}";
        await RecordBatchAsync(key, sceneId, "[\"b\",\"a\"]");

        using (var first = _factory.Services.CreateScope())
        {
            var reverser = first.ServiceProvider.GetRequiredService<IAgentOperationReverser>();
            var plan = await reverser.PlanAsync(key, null);
            var applied = await reverser.ApplyAsync(plan.Value);
            Assert.False(applied.Value.Single().Reversed);
        }

        // The user detaches the vase that was holding the row up.
        using (var detach = _factory.Services.CreateScope())
        {
            var written = await detach.ServiceProvider.GetRequiredService<ISceneWriter>().ApplyAsync(
                sceneId,
                null,
                document => document with
                {
                    Nodes = document.Nodes.Select(n => n.Id == "c" ? n with { Anchor = null } : n).ToList(),
                });
            Assert.True(written.IsSuccess);
        }

        using (var retry = _factory.Services.CreateScope())
        {
            var reverser = retry.ServiceProvider.GetRequiredService<IAgentOperationReverser>();
            var plan = await reverser.PlanAsync(key, null);
            var applied = await reverser.ApplyAsync(plan.Value);
            Assert.True(applied.Value.Single().Reversed);
        }

        Assert.Equal(["c"], await NodeIdsAsync(_factory, sceneId));
    }
}
