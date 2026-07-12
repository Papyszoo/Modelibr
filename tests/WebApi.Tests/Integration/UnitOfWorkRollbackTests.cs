using Application.Abstractions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Proves the core claim of prompt 25's unit-of-work migration: once
/// repositories stop self-committing, a command handler's mutations across
/// multiple repositories only become durable together, via a single
/// IUnitOfWork.SaveChangesAsync call. If that save fails partway through,
/// NOTHING from the unit of work persists — not even mutations staged on a
/// repository whose own write would otherwise have succeeded.
///
/// This has to run against real PostgreSQL (Category=Integration, via
/// ModelibrWebFactory): EF Core's InMemory provider doesn't reliably enforce
/// unique constraints the way a relational database does, so it can't
/// distinguish "the whole SaveChanges rolled back" from "the offending row
/// just never got added" — see the backend-patterns skill.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class UnitOfWorkRollbackTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public UnitOfWorkRollbackTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SaveChanges_FailureOnSecondRepoMutation_RollsBackFirstRepoMutationToo()
    {
        // Arrange: two repositories that are both fully migrated off
        // self-commit (settings + packs slices) — ISettingRepository and
        // IPackRepository. Stage a valid Setting add (repo #1), then a valid
        // Pack add (repo #2, a different repository/aggregate entirely), then
        // force a real Postgres unique-constraint violation via a second
        // Setting with the same Key (Setting.Key has a unique index).
        using var scope = _factory.Services.CreateScope();

        // App startup applies migrations itself (Program.cs calls
        // InitializeDatabaseAsync before app.Run), but it swallows failures
        // to let the app start without DB connectivity — and this test talks
        // to the DbContext directly, without an HTTP round-trip to fall back
        // on. Re-applying here is idempotent and removes any dependency on
        // that startup path having already won a race against
        // ModelibrWebFactory's drop/recreate of the shared test database.
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var settingRepository = scope.ServiceProvider.GetRequiredService<ISettingRepository>();
        var packRepository = scope.ServiceProvider.GetRequiredService<IPackRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var now = DateTime.UtcNow;
        var key = $"rollback-test-{Guid.NewGuid():N}";
        var packName = $"rollback-test-pack-{Guid.NewGuid():N}";

        await settingRepository.AddAsync(Setting.Create(key, "first-value", now));
        await packRepository.AddAsync(Pack.Create(packName, null, null, null, now));

        // The failing mutation: same Key again, still unsaved, so nothing has
        // caught this yet — the unique index only fires at the database on
        // SaveChanges.
        await settingRepository.AddAsync(Setting.Create(key, "second-value", now));

        // Act: exactly one SaveChanges for the whole unit of work.
        var thrown = await Assert.ThrowsAnyAsync<DbUpdateException>(
            () => unitOfWork.SaveChangesAsync());

        Assert.IsType<PostgresException>(thrown.InnerException);
        Assert.Equal(PostgresErrorCodes.UniqueViolation, ((PostgresException)thrown.InnerException!).SqlState);

        // Assert: NOTHING persisted — not the Setting that would have been
        // valid on its own, and not the unrelated Pack either. Query through a
        // fresh scope/DbContext so there's no chance of reading back
        // still-tracked, never-actually-saved in-memory state.
        using var verifyScope = _factory.Services.CreateScope();
        var verifySettingRepository = verifyScope.ServiceProvider.GetRequiredService<ISettingRepository>();
        var verifyPackRepository = verifyScope.ServiceProvider.GetRequiredService<IPackRepository>();

        var persistedSetting = await verifySettingRepository.GetByKeyAsync(key);
        var persistedPack = await verifyPackRepository.GetByNameAsync(packName);

        Assert.Null(persistedSetting);
        Assert.Null(persistedPack);
    }
}
