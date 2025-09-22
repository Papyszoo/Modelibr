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