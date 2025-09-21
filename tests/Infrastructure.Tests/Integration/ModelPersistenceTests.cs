using Application.Models;
using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Infrastructure.Storage;
using Infrastructure.Tests.Fakes;
using Microsoft.EntityFrameworkCore;
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
        var repository = new ModelRepository(context);
        
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
        var repository = new ModelRepository(context);
        
        var root = Path.Combine(Path.GetTempPath(), "modelibr_test", Path.GetRandomFileName());
        Directory.CreateDirectory(root);
        var pathProvider = new FakeUploadPathProvider(root);
        var storage = new HashBasedFileStorage(pathProvider);
        
        var handler = new AddModelCommandHandler(storage, repository);
        
        Assert.NotNull(handler);
    }
}