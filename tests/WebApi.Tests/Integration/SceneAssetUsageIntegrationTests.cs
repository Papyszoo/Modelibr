using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Projects;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The projection behind a project's derived asset list (prompt 13-C), against real
/// PostgreSQL. It is LINQ that exists only to be translated - the handler tests mock the
/// repository away, so a join that EF cannot translate, or that translates to the wrong one,
/// would pass every unit test and fail on the first real project page.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class SceneAssetUsageIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public SceneAssetUsageIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    private static SceneDocument DocumentOf(params (string NodeId, int ModelId)[] nodes) =>
        new(
            SceneDocument.CurrentSchemaVersion,
            nodes.Select(n => new SceneNode(
                n.NodeId,
                SceneTransform.Identity,
                Asset: new SceneAssetRef(SceneAssetTypes.Model, n.ModelId, null))).ToList(),
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default);

    private static Scene SceneWith(string name, SceneDocument document, int? projectId, DateTime now) =>
        Scene.Create(name, SceneDocumentCodec.Serialize(document), document.SchemaVersion, now, null, projectId).Value;

    [Fact]
    public async Task AProjectsAssets_IncludeWhatItsScenesReferenceWithoutBeingMembers()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var now = DateTime.UtcNow;
        var member = Model.Create($"member-{suffix}", now);
        var placed = Model.Create($"placed-{suffix}", now);
        context.Models.AddRange(member, placed);
        await context.SaveChangesAsync();

        var project = Project.Create($"Nightfall {suffix}", null, now);
        project.AddModel(member, now);
        context.Projects.Add(project);
        await context.SaveChangesAsync();

        // Twelve nodes of one asset: the count the node-keyed primary key exists to keep right.
        var living = SceneWith(
            $"Living Room {suffix}",
            DocumentOf(Enumerable.Range(1, 12).Select(i => ($"chair-{i}", placed.Id)).ToArray()),
            project.Id,
            now);
        context.Scenes.Add(living);
        await context.SaveChangesAsync();

        var usage = scope.ServiceProvider.GetRequiredService<ISceneAssetUsageRepository>();
        await usage.ReplaceForSceneAsync(
            living.Id, SceneAssetUsageProjection.From(living.Id, DocumentOf(
                Enumerable.Range(1, 12).Select(i => ($"chair-{i}", placed.Id)).ToArray())),
            CancellationToken.None);
        await context.SaveChangesAsync();

        var used = await usage.ForProjectAsync(project.Id, CancellationToken.None);

        var row = Assert.Single(used);
        Assert.Equal(placed.Id, row.AssetId);
        Assert.Equal($"placed-{suffix}", row.Name);
        Assert.Equal(12, row.NodeCount);
        Assert.Equal(new[] { $"Living Room {suffix}" }, row.SceneNames);

        // The read model unions the two, keeps both counts, and says where each row came from.
        var handler = scope.ServiceProvider
            .GetRequiredService<IQueryHandler<GetProjectByIdQuery, ProjectDetailDto>>();
        var detail = await handler.Handle(new GetProjectByIdQuery(project.Id), CancellationToken.None);

        Assert.True(detail.IsSuccess);
        Assert.Equal(1, detail.Value.ModelCount);
        Assert.Equal(2, detail.Value.ModelCountIncludingScenes);

        var memberRow = detail.Value.Models.Single(m => m.Id == member.Id);
        var derivedRow = detail.Value.Models.Single(m => m.Id == placed.Id);
        Assert.Empty(memberRow.UsedInScenes);
        Assert.Equal(new[] { $"Living Room {suffix}" }, derivedRow.UsedInScenes);
    }

    /// <summary>
    /// Two rows that look identical in a grid and behave differently on remove are worse than
    /// no list at all - so removing the scene-derived one is refused, with the scene named.
    /// </summary>
    [Fact]
    public async Task RemovingASceneDerivedAsset_IsRefusedAndNamesTheScene()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var now = DateTime.UtcNow;
        var placed = Model.Create($"placed-{suffix}", now);
        context.Models.Add(placed);
        await context.SaveChangesAsync();

        var project = Project.Create($"Daybreak {suffix}", null, now);
        context.Projects.Add(project);
        await context.SaveChangesAsync();

        var document = DocumentOf(("sofa", placed.Id));
        var scene = SceneWith($"Study {suffix}", document, project.Id, now);
        context.Scenes.Add(scene);
        await context.SaveChangesAsync();

        var usage = scope.ServiceProvider.GetRequiredService<ISceneAssetUsageRepository>();
        await usage.ReplaceForSceneAsync(
            scene.Id, SceneAssetUsageProjection.From(scene.Id, document), CancellationToken.None);
        await context.SaveChangesAsync();

        var remove = scope.ServiceProvider
            .GetRequiredService<ICommandHandler<RemoveModelFromProjectCommand>>();
        var result = await remove.Handle(
            new RemoveModelFromProjectCommand(project.Id, placed.Id), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Project.AssetIsSceneDerived", result.Error.Code);
        Assert.Contains($"Study {suffix}", result.Error.Message);
    }

    [Fact]
    public async Task ScenesUsingAnAsset_AreListedWithTheirNodeCounts()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var now = DateTime.UtcNow;
        var shared = Model.Create($"shared-{suffix}", now);
        context.Models.Add(shared);
        await context.SaveChangesAsync();

        var first = DocumentOf(("a", shared.Id), ("b", shared.Id));
        var second = DocumentOf(("only", shared.Id));
        var sceneOne = SceneWith($"Alpha {suffix}", first, null, now);
        var sceneTwo = SceneWith($"Beta {suffix}", second, null, now);
        context.Scenes.AddRange(sceneOne, sceneTwo);
        await context.SaveChangesAsync();

        var usage = scope.ServiceProvider.GetRequiredService<ISceneAssetUsageRepository>();
        await usage.ReplaceForSceneAsync(sceneOne.Id, SceneAssetUsageProjection.From(sceneOne.Id, first), CancellationToken.None);
        await usage.ReplaceForSceneAsync(sceneTwo.Id, SceneAssetUsageProjection.From(sceneTwo.Id, second), CancellationToken.None);
        await context.SaveChangesAsync();

        var handler = scope.ServiceProvider
            .GetRequiredService<IQueryHandler<GetScenesUsingAssetQuery, ScenesUsingAssetResponse>>();
        var result = await handler.Handle(
            new GetScenesUsingAssetQuery(SceneAssetTypes.Model, shared.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value.Scenes.Count);
        Assert.Equal(2, result.Value.Scenes.Single(s => s.SceneName == $"Alpha {suffix}").NodeCount);
        Assert.Equal(1, result.Value.Scenes.Single(s => s.SceneName == $"Beta {suffix}").NodeCount);
    }

    /// <summary>
    /// Rebuilt wholesale, not diffed: the document is replaced outright by several writers, and
    /// a stale row would make the project claim an asset no scene points at any more.
    /// </summary>
    [Fact]
    public async Task RewritingASceneReplacesItsRowsRatherThanAddingToThem()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var now = DateTime.UtcNow;
        var before = Model.Create($"before-{suffix}", now);
        var after = Model.Create($"after-{suffix}", now);
        context.Models.AddRange(before, after);
        await context.SaveChangesAsync();

        var scene = SceneWith($"Swap {suffix}", DocumentOf(("sofa", before.Id)), null, now);
        context.Scenes.Add(scene);
        await context.SaveChangesAsync();

        var usage = scope.ServiceProvider.GetRequiredService<ISceneAssetUsageRepository>();
        await usage.ReplaceForSceneAsync(
            scene.Id, SceneAssetUsageProjection.From(scene.Id, DocumentOf(("sofa", before.Id))), CancellationToken.None);
        await context.SaveChangesAsync();

        await usage.ReplaceForSceneAsync(
            scene.Id, SceneAssetUsageProjection.From(scene.Id, DocumentOf(("sofa", after.Id))), CancellationToken.None);
        await context.SaveChangesAsync();

        Assert.Empty(await usage.ScenesUsingAsync(SceneAssetTypes.Model, before.Id, CancellationToken.None));
        Assert.Single(await usage.ScenesUsingAsync(SceneAssetTypes.Model, after.Id, CancellationToken.None));
    }
}
