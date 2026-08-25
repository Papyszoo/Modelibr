using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Packs;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class PackMembershipConcurrencyIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;

    public PackMembershipConcurrencyIntegrationTests(ModelibrWebFactory factory)
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
    public async Task Concurrent_AddModelToPack_Does_Not_Lose_Unrelated_Staged_Mutations_Or_Emit_Bogus_Effects()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var now = DateTime.UtcNow;

        int packId;
        int modelId;

        // Seed unassociated pack and model
        using (var setupScope = _factory.Services.CreateScope())
        {
            var context = setupScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var pack = Pack.Create($"Pack-{suffix}", null, null, null, now);
            var model = Model.Create($"Model-{suffix}", now);
            context.Packs.Add(pack);
            context.Models.Add(model);
            await context.SaveChangesAsync();
            packId = pack.Id;
            modelId = model.Id;
        }

        // Two scopes load the pack and model before either commits
        using var scope1 = _factory.Services.CreateScope();
        using var scope2 = _factory.Services.CreateScope();

        var context1 = scope1.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var context2 = scope2.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var pack1 = await context1.Packs.Include(p => p.Models).FirstAsync(p => p.Id == packId);
        var model1 = await context1.Models.FirstAsync(m => m.Id == modelId);

        var pack2 = await context2.Packs.Include(p => p.Models).FirstAsync(p => p.Id == packId);
        var model2 = await context2.Models.FirstAsync(m => m.Id == modelId);

        Assert.False(pack1.HasModel(model1.Id));
        Assert.False(pack2.HasModel(model2.Id));

        var postCommit1 = scope1.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var postCommit2 = scope2.ServiceProvider.GetRequiredService<IPostCommitActions>();

        var uow1 = scope1.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var uow2 = scope2.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var packRepo1 = scope1.ServiceProvider.GetRequiredService<IPackRepository>();
        var packRepo2 = scope2.ServiceProvider.GetRequiredService<IPackRepository>();

        var ran1 = new List<string>();
        var ran2 = new List<string>();

        // Stage unrelated mutations in each scope
        var settingKey1 = $"setting-1-{suffix}";
        var settingKey2 = $"setting-2-{suffix}";

        context1.Settings.Add(Setting.Create(settingKey1, "val1", now));
        postCommit1.Enqueue("effect-1", () => ran1.Add("effect-1"));

        context2.Settings.Add(Setting.Create(settingKey2, "val2", now));
        postCommit2.Enqueue("effect-2", () => ran2.Add("effect-2"));

        var handler1 = scope1.ServiceProvider.GetRequiredService<ICommandHandler<AddModelToPackCommand>>();
        var handler2 = scope2.ServiceProvider.GetRequiredService<ICommandHandler<AddModelToPackCommand>>();

        // Scope 1 and Scope 2 both execute AddModelToPackCommand concurrently
        var t1 = handler1.Handle(new AddModelToPackCommand(packId, modelId), CancellationToken.None);
        var t2 = handler2.Handle(new AddModelToPackCommand(packId, modelId), CancellationToken.None);

        var results = await Task.WhenAll(t1, t2);

        Assert.True(results[0].IsSuccess, "Scope 1 should succeed");
        Assert.True(results[1].IsSuccess, "Scope 2 should succeed");

        // Verify database state from a clean scope
        using (var verifyScope = _factory.Services.CreateScope())
        {
            var verifyContext = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // 1. Exactly one PackModels row exists
            var count = await verifyContext.Database
                .SqlQuery<int>($"SELECT COUNT(*)::int as \"Value\" FROM \"PackModels\" WHERE \"PacksId\" = {packId} AND \"ModelsId\" = {modelId}")
                .SingleAsync();
            Assert.Equal(1, count);

            // 2. Unrelated mutation state from both operations MUST be committed
            var s1 = await verifyContext.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == settingKey1);
            var s2 = await verifyContext.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == settingKey2);

            Assert.NotNull(s1);
            Assert.NotNull(s2); // Fails on pre-fix code because PK_PackModels exception rolled back setting2 while ChangeTracker.Clear() made it look like success!
        }

        // 3. Post-commit actions run exactly once for each committed save
        Assert.Equal(["effect-1"], ran1);
        Assert.Equal(["effect-2"], ran2);
    }

    [Fact]
    public async Task Unrelated_Unique_Constraint_Violation_Still_Throws_DbUpdateException()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var now = DateTime.UtcNow;

        var s1 = Setting.Create($"unique-key-{suffix}", "val1", now);
        var s2 = Setting.Create($"unique-key-{suffix}", "val2", now);

        context.Settings.Add(s1);
        await uow.SaveChangesAsync();

        context.Settings.Add(s2);
        // Must throw DbUpdateException, not swallowed
        await Assert.ThrowsAsync<DbUpdateException>(() => uow.SaveChangesAsync());
    }
}
