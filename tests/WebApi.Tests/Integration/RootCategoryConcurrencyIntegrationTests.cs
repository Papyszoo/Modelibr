using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Proves the schema change behind root-category uniqueness, which nothing below the
/// database can prove.
///
/// <para>
/// The bug: the unique index on each category tree is (ParentId, Name), and PostgreSQL
/// treats NULLs as distinct - so it constrains children and says nothing about roots. Two
/// imports classifying at the same time both created "Vehicles". The reconciliation that
/// preceded this (scan after inserting, keep the lowest id) does not close it either: the
/// higher-id transaction can run its scan before the lower-id one commits, see nothing to
/// defer to, and keep its row.
/// </para>
///
/// <para>
/// Only real PostgreSQL can show that - EF Core's InMemory provider does not enforce
/// partial expression indexes, and a mocked repository is exactly the thing being doubted.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class RootCategoryConcurrencyIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;

    public RootCategoryConcurrencyIntegrationTests(ModelibrWebFactory factory)
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
    public async Task Two_Callers_Creating_One_Root_At_Once_End_Up_With_One_Category()
    {
        var name = $"Vehicles-{Guid.NewGuid():N}";
        var now = DateTime.UtcNow;

        // Two scopes, so two DbContexts and two transactions - the shape a parallel folder
        // upload produces, not two calls sharing one change tracker.
        var results = await Task.WhenAll(
            AddRootAsync(name, now),
            AddRootAsync(name, now));

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var roots = await context.ModelCategories
            .AsNoTracking()
            .Where(c => c.ParentId == null && c.Name == name)
            .ToListAsync();

        // One row survives...
        Assert.Single(roots);
        // ...exactly one caller created it...
        Assert.Equal(1, results.Count(r => r.Created));
        // ...and BOTH came away pointing at it, which is the half that matters: a loser
        // that got an error instead would leave its model uncategorised.
        Assert.All(results, r => Assert.Equal(roots[0].Id, r.Category.Id));
    }

    [Fact]
    public async Task A_Root_Differing_Only_In_Case_Is_The_Same_Root()
    {
        // The comparison the application means at the root: the import automation folds
        // "Vehicles" and "vehicles" into one category, so the index has to as well.
        var name = $"Props-{Guid.NewGuid():N}";
        var now = DateTime.UtcNow;

        var first = await AddRootAsync(name, now);
        var second = await AddRootAsync(name.ToUpperInvariant(), now);

        Assert.True(first.Created);
        Assert.False(second.Created);
        Assert.Equal(first.Category.Id, second.Category.Id);
    }

    [Fact]
    public async Task Two_Children_Of_One_Parent_Are_Still_Governed_By_The_Old_Rule()
    {
        // The root index must not have tightened child uniqueness: a hand-built branch has
        // always been free to hold "Crate" and "crate", and quietly changing that would
        // break existing libraries.
        var rootName = $"Branch-{Guid.NewGuid():N}";
        var now = DateTime.UtcNow;
        var root = await AddRootAsync(rootName, now);

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        context.ModelCategories.Add(ModelCategory.Create("Crate", null, root.Category.Id, now));
        context.ModelCategories.Add(ModelCategory.Create("crate", null, root.Category.Id, now));

        await context.SaveChangesAsync();

        var children = await context.ModelCategories
            .AsNoTracking()
            .Where(c => c.ParentId == root.Category.Id)
            .CountAsync();
        Assert.Equal(2, children);
    }

    [Fact]
    public async Task A_Texture_Set_Root_Is_Unique_Per_Kind_Not_Across_Kinds()
    {
        // Universal (Global Materials) and ModelSpecific (Multi-Model Textures) are
        // separate asset types that never share a vocabulary, so a "Stone" root in each is
        // two categories rather than a duplicate.
        var name = $"Stone-{Guid.NewGuid():N}";
        var now = DateTime.UtcNow;

        var universal = await AddTextureSetRootAsync(name, TextureSetKind.Universal, now);
        var modelSpecific = await AddTextureSetRootAsync(name, TextureSetKind.ModelSpecific, now);
        var universalAgain = await AddTextureSetRootAsync(name, TextureSetKind.Universal, now);

        Assert.True(universal.Created);
        Assert.True(modelSpecific.Created);
        Assert.NotEqual(universal.Category.Id, modelSpecific.Category.Id);

        // ...but a second Universal "Stone" is the same category.
        Assert.False(universalAgain.Created);
        Assert.Equal(universal.Category.Id, universalAgain.Category.Id);
    }

    private async Task<CategoryRootInsert<ModelCategory>> AddRootAsync(string name, DateTime now)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IModelCategoryRepository>();
        return await repository.AddRootAsync(ModelCategory.Create(name, null, null, now));
    }

    private async Task<CategoryRootInsert<TextureSetCategory>> AddTextureSetRootAsync(
        string name, TextureSetKind kind, DateTime now)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<ITextureSetCategoryRepository>();
        return await repository.AddRootAsync(TextureSetCategory.Create(name, null, null, kind, now));
    }
}
