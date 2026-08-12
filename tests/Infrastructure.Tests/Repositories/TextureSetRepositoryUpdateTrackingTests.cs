using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Infrastructure.Tests.Repositories;

/// <summary>
/// Focused repository-level coverage for the UpdateAsync tracking guard
/// (<see cref="DbContextTrackingExtensions.UpdateIfDetached{TEntity}"/>),
/// added to fix PR #568's regression: once repositories stopped
/// self-committing (see the backend-patterns skill, "Transactions - unit of
/// work"), TextureSetRepository.UpdateAsync called
/// <c>_context.TextureSets.Update(textureSet)</c> unconditionally. Calling
/// that on an entity still tracked as Added with a temporary (not yet
/// DB-assigned) key - exactly what CreateTextureSetWithFileCommandHandler
/// does (AddAsync -> AddTexture -> UpdateAsync -> one SaveChanges) - throws
/// "The property 'TextureSet.Id' has a temporary value while attempting to
/// change the entity's state to 'Modified'." Uses EF Core's InMemory
/// provider because this is purely change-tracker/temporary-key behavior,
/// not something that needs real Postgres (see
/// WebApi.Tests.Integration.RepositoryUpdateTrackingTests for the end-to-end
/// reproduction against the real database and a second repository/aggregate).
/// </summary>
public class TextureSetRepositoryUpdateTrackingTests
{
    private static ApplicationDbContext NewContext(string? databaseName = null)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: databaseName ?? Guid.NewGuid().ToString())
            .Options;
        var context = new ApplicationDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    [Fact]
    public async Task UpdateAsync_AddedButUnsavedEntity_PersistsWithoutThrowing()
    {
        // The exact regressed shape: Add (tracked as Added, temporary key) ->
        // mutate -> UpdateAsync on the SAME reference -> SaveChanges, with no
        // intervening commit in between.
        await using var context = NewContext();
        var repository = new TextureSetRepository(context);

        var added = await repository.AddAsync(
            TextureSet.Create("regression-set", DateTime.UtcNow, TextureSetKind.ModelSpecific));

        added.UpdateName("renamed-set", DateTime.UtcNow);

        // Act: must not throw.
        var updated = await repository.UpdateAsync(added);
        await context.SaveChangesAsync();

        // Assert: got a real, non-temporary id and the mutation was persisted.
        Assert.True(updated.Id > 0);
        var persisted = await context.TextureSets.AsNoTracking()
            .FirstOrDefaultAsync(ts => ts.Id == updated.Id);
        Assert.NotNull(persisted);
        Assert.Equal("renamed-set", persisted!.Name);
    }

    [Fact]
    public async Task UpdateAsync_DetachedEntity_PersistsModification()
    {
        // The reverse hazard: a genuinely Detached entity (loaded/rehydrated
        // outside the current context) must still be attached and marked
        // Modified - the guard must not turn UpdateAsync into a no-op for the
        // exact case it exists to handle.
        var databaseName = Guid.NewGuid().ToString();

        int textureSetId;
        await using (var seedContext = NewContext(databaseName))
        {
            var seedRepository = new TextureSetRepository(seedContext);
            var seeded = await seedRepository.AddAsync(
                TextureSet.Create("detached-set", DateTime.UtcNow, TextureSetKind.ModelSpecific));
            await seedContext.SaveChangesAsync();
            textureSetId = seeded.Id;
        }

        // Load a genuinely detached instance from a separate, short-lived context.
        TextureSet detached;
        await using (var loadContext = NewContext(databaseName))
        {
            detached = await loadContext.TextureSets.AsNoTracking()
                .FirstAsync(ts => ts.Id == textureSetId);
        }

        detached.UpdateName("detached-renamed", DateTime.UtcNow);

        await using var updateContext = NewContext(databaseName);
        var updateRepository = new TextureSetRepository(updateContext);
        await updateRepository.UpdateAsync(detached);
        await updateContext.SaveChangesAsync();

        await using var verifyContext = NewContext(databaseName);
        var persisted = await verifyContext.TextureSets.AsNoTracking()
            .FirstOrDefaultAsync(ts => ts.Id == textureSetId);

        Assert.NotNull(persisted);
        Assert.Equal("detached-renamed", persisted!.Name);
    }
}
