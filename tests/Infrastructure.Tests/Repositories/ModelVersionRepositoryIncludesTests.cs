using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Infrastructure.Tests.Repositories;

/// <summary>
/// <c>ImportModelSceneGraphCommand</c> rebuilds the search projection from the graph this
/// repository hands it, and denormalises four things off the model onto every document:
/// category, packs, authored tags and description. Three of those were included here and
/// tags were not, so <c>version.Model.Tags</c> came back empty and each re-derive wrote a
/// document with no tags in it - blanking, on the projection, the vocabulary a user had
/// typed. Silent in both directions: the tags stayed correct in the library, and search
/// simply stopped answering to them until someone edited them again.
///
/// Lazy loading is off, so an include that is missing is the whole bug; a fresh context per
/// read is what makes that visible rather than served from the change tracker.
/// </summary>
public class ModelVersionRepositoryIncludesTests
{
    private static readonly DateTime Now = new(2026, 8, 18, 12, 0, 0, DateTimeKind.Utc);

    private static DbContextOptions<ApplicationDbContext> NewDatabase() =>
        new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

    [Fact]
    public async Task GetByIdAsync_Loads_The_Metadata_The_Search_Projection_Denormalises()
    {
        var options = NewDatabase();
        int versionId;

        await using (var seed = new ApplicationDbContext(options))
        {
            var category = ModelCategory.Create("Furniture", null, null, Now);
            seed.ModelCategories.Add(category);

            var pack = Pack.Create("POLYGON City", null, "CC0", null, Now);
            seed.Packs.Add(pack);

            var model = Model.Create("SM_Prop_Couch_01", Now);
            seed.Models.Add(model);
            await seed.SaveChangesAsync();

            model.AssignCategory(category.Id, Now);
            model.SetMetadata(new[] { ModelTag.Create("rustic oak", Now) }, "a worn leather couch", Now);
            model.Packs.Add(pack);

            var version = model.CreateVersion(1, null, Now);
            await seed.SaveChangesAsync();
            versionId = version.Id;
        }

        await using var read = new ApplicationDbContext(options);
        var loaded = await new ModelVersionRepository(read).GetByIdAsync(versionId);

        Assert.NotNull(loaded);
        Assert.NotNull(loaded!.Model);
        Assert.Equal("rustic oak", Assert.Single(loaded.Model.Tags).Name);
        Assert.Equal("POLYGON City", Assert.Single(loaded.Model.Packs).Name);
        Assert.Equal("Furniture", loaded.Model.ModelCategory?.Name);
        Assert.Equal("a worn leather couch", loaded.Model.Description);
    }
}
