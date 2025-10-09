using Application.Abstractions.Services;
using Application.Models;
using Application.Services;
using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Infrastructure.Storage;
using Infrastructure.Tests.Fakes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SharedKernel;
using Xunit;

namespace Infrastructure.Tests.Integration;

public class ModelPersistenceTests
{
    [Fact]
    public void CanCreateModelRepository()
    {
        // This is a smoke test to ensure the repository can be created
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;
        
        using var context = new ApplicationDbContext(options);
        var dateTimeProvider = new DateTimeProvider();
        var repository = new ModelRepository(context, dateTimeProvider);
        
        Assert.NotNull(repository);
    }

    [Fact]
    public void CanCreateAddModelCommandHandler()
    {
        // This is a smoke test to ensure the handler can be created
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;
        
        using var context = new ApplicationDbContext(options);
        var dateTimeProvider = new DateTimeProvider();
        var modelRepository = new ModelRepository(context, dateTimeProvider);
        var fileRepository = new FileRepository(context);
        
        var root = Path.Combine(Path.GetTempPath(), "modelibr_test", Path.GetRandomFileName());
        Directory.CreateDirectory(root);
        var pathProvider = new FakeUploadPathProvider(root);
        var storage = new HashBasedFileStorage(pathProvider);
        var fileUtilityService = new FileUtilityService();
        
        var fileCreationService = new FileCreationService(storage, fileRepository, fileUtilityService, dateTimeProvider);
        
        // Create a fake domain event dispatcher for testing
        var domainEventDispatcher = new FakeDomainEventDispatcher();
        
        var handler = new AddModelCommandHandler(modelRepository, fileCreationService, dateTimeProvider, domainEventDispatcher);
        
        Assert.NotNull(handler);
    }

    [Fact]
    public async Task ModelTextureSetRelationship_PersistsCorrectly()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        // Create entities and establish relationship
        using (var context = new ApplicationDbContext(options))
        {
            // Ensure database is created
            await context.Database.EnsureCreatedAsync();

            // Create a model
            var model = Model.Create("Test Model", DateTime.UtcNow);
            context.Models.Add(model);
            await context.SaveChangesAsync();

            // Create texture sets
            var textureSet1 = TextureSet.Create("Pack 1", DateTime.UtcNow);
            var textureSet2 = TextureSet.Create("Pack 2", DateTime.UtcNow);
            context.TextureSets.Add(textureSet1);
            context.TextureSets.Add(textureSet2);
            await context.SaveChangesAsync();

            // Associate texture sets with model using domain methods
            model.AddTextureSet(textureSet1, DateTime.UtcNow.AddMinutes(1));
            model.AddTextureSet(textureSet2, DateTime.UtcNow.AddMinutes(2));
            await context.SaveChangesAsync();
        }

        // Verify relationships persist correctly
        using (var context = new ApplicationDbContext(options))
        {
            // Load model with texture sets
            var model = await context.Models
                .Include(m => m.TextureSets)
                .FirstAsync();

            // Load texture sets with models
            var textureSets = await context.TextureSets
                .Include(tp => tp.Models)
                .ToListAsync();

            // Assert model side
            Assert.Equal(2, model.TextureSets.Count);
            Assert.Contains(model.TextureSets, tp => tp.Name == "Pack 1");
            Assert.Contains(model.TextureSets, tp => tp.Name == "Pack 2");

            // Assert texture set side
            Assert.Equal(2, textureSets.Count);
            Assert.All(textureSets, tp => 
            {
                Assert.Single(tp.Models);
                Assert.Equal("Test Model", tp.Models.First().Name);
            });
        }
    }

    [Fact]
    public async Task ModelRepository_LoadsTextureSetsCorrectly()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        using var context = new ApplicationDbContext(options);
        await context.Database.EnsureCreatedAsync();

        var dateTimeProvider = new DateTimeProvider();
        var repository = new ModelRepository(context, dateTimeProvider);

        // Create and save entities with relationship
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var textureSet = TextureSet.Create("Test Pack", DateTime.UtcNow);
        
        context.Models.Add(model);
        context.TextureSets.Add(textureSet);
        await context.SaveChangesAsync();

        model.AddTextureSet(textureSet, DateTime.UtcNow.AddMinutes(1));
        await context.SaveChangesAsync();

        // Act - Load model through repository
        var loadedModel = await repository.GetByIdAsync(model.Id);

        // Assert
        Assert.NotNull(loadedModel);
        Assert.Single(loadedModel.TextureSets);
        Assert.Equal("Test Pack", loadedModel.TextureSets.First().Name);
    }
}

/// <summary>
/// Fake domain event dispatcher for testing that does nothing.
/// </summary>
internal class FakeDomainEventDispatcher : IDomainEventDispatcher
{
    public Task<Result> PublishAsync(IEnumerable<IDomainEvent> domainEvents, CancellationToken cancellationToken = default)
    {
        // Do nothing for tests
        return Task.FromResult(Result.Success());
    }
}