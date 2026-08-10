using Application.Abstractions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Regression: ImportModelSceneGraphCommand reads
/// <c>version.Model?.Name</c> to seed the derived asset name and the asset-level
/// search document's DisplayName + tokens. <c>ModelVersionRepository.GetByIdAsync</c>
/// used to omit <c>.Include(v =&gt; v.Model)</c>, so <c>version.Model</c> was null,
/// every model's real name was dropped, and the whole library indexed as
/// "Model {id}" with empty tokens — unsearchable by name unless an internal mesh
/// happened to share it. Found by importing the 900-model base-meshes library and
/// seeing every asset doc come back as "Model N". GetByIdAsync must load Model.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class ModelVersionIncludeModelRegressionTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public ModelVersionIncludeModelRegressionTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetByIdAsync_LoadsModel_SoTheNameReachesExtraction()
    {
        int versionId;
        var name = $"glowstick-{Guid.NewGuid():N}";

        using (var seedScope = _factory.Services.CreateScope())
        {
            var context = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await context.Database.MigrateAsync();

            var model = Model.Create(name, DateTime.UtcNow);
            context.Models.Add(model);
            await context.SaveChangesAsync();

            var version = model.CreateVersion("v1", DateTime.UtcNow);
            await context.SaveChangesAsync();
            versionId = version.Id;
        }

        // Fresh scope: the version must come back with its Model navigation loaded,
        // exactly as ImportModelSceneGraphCommand consumes it (version.Model?.Name).
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IModelVersionRepository>();

        var loaded = await repository.GetByIdAsync(versionId);

        Assert.NotNull(loaded);
        Assert.NotNull(loaded!.Model);
        Assert.Equal(name, loaded.Model!.Name);
    }
}
