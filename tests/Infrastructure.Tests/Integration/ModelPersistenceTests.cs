using Application.Abstractions.Repositories;
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
        
        // Create a fake batch upload repository for testing
        var batchUploadRepository = new FakeBatchUploadRepository();
        
        // Create a fake metadata extraction service for testing
        var metadataExtractionService = new FakeModelMetadataExtractionService();
        
        var handler = new AddModelCommandHandler(modelRepository, fileCreationService, dateTimeProvider, domainEventDispatcher, batchUploadRepository, metadataExtractionService);
        
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

/// <summary>
/// Fake batch upload repository for testing that does nothing.
/// </summary>
internal class FakeBatchUploadRepository : IBatchUploadRepository
{
    public Task<BatchUpload?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<BatchUpload?>(null);
    }

    public Task<IEnumerable<BatchUpload>> GetByBatchIdAsync(string batchId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(Enumerable.Empty<BatchUpload>());
    }

    public Task<IEnumerable<BatchUpload>> GetByUploadTypeAsync(string uploadType, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(Enumerable.Empty<BatchUpload>());
    }

    public Task<IEnumerable<BatchUpload>> GetByDateRangeAsync(DateTime from, DateTime to, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(Enumerable.Empty<BatchUpload>());
    }

    public Task<BatchUpload?> GetByFileIdAsync(int fileId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<BatchUpload?>(null);
    }

    public Task AddAsync(BatchUpload batchUpload, CancellationToken cancellationToken = default)
    {
        // Do nothing for tests
        return Task.CompletedTask;
    }

    public Task AddRangeAsync(IEnumerable<BatchUpload> batchUploads, CancellationToken cancellationToken = default)
    {
        // Do nothing for tests
        return Task.CompletedTask;
    }

    public Task UpdateAsync(BatchUpload batchUpload, CancellationToken cancellationToken = default)
    {
        // Do nothing for tests
        return Task.CompletedTask;
    }

    public Task<IEnumerable<BatchUpload>> GetByModelIdAsync(int modelId, CancellationToken cancellationToken = default)
    {
        // Do nothing for tests
        return Task.FromResult(Enumerable.Empty<BatchUpload>());
    }
}

/// <summary>
/// Fake model metadata extraction service for testing that returns null.
/// </summary>
internal class FakeModelMetadataExtractionService : IModelMetadataExtractionService
{
    public Task<ModelMetadata?> ExtractMetadataAsync(string filePath, CancellationToken cancellationToken = default)
    {
        // Return null for tests (metadata not available)
        return Task.FromResult<ModelMetadata?>(null);
    }
}