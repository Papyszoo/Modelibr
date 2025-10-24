using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Infrastructure.Tests.Integration;

public class ModelVersionPersistenceTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly IModelVersionRepository _versionRepository;

    public ModelVersionPersistenceTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);
        _versionRepository = new Repositories.ModelVersionRepository(_context);
    }

    [Fact]
    public async Task AddAsync_SavesVersionToDatabase()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        _context.Models.Add(model);
        await _context.SaveChangesAsync();

        var version = ModelVersion.Create(model.Id, 1, "Initial version", DateTime.UtcNow);

        // Act
        var result = await _versionRepository.AddAsync(version);

        // Assert
        Assert.NotEqual(0, result.Id);
        var savedVersion = await _context.ModelVersions.FindAsync(result.Id);
        Assert.NotNull(savedVersion);
        Assert.Equal(1, savedVersion.VersionNumber);
        Assert.Equal("Initial version", savedVersion.Description);
    }

    [Fact]
    public async Task GetByModelIdAsync_ReturnsAllVersionsForModel()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        _context.Models.Add(model);
        await _context.SaveChangesAsync();

        var version1 = ModelVersion.Create(model.Id, 1, "Version 1", DateTime.UtcNow);
        var version2 = ModelVersion.Create(model.Id, 2, "Version 2", DateTime.UtcNow.AddMinutes(1));
        await _versionRepository.AddAsync(version1);
        await _versionRepository.AddAsync(version2);

        // Act
        var versions = await _versionRepository.GetByModelIdAsync(model.Id);

        // Assert
        Assert.Equal(2, versions.Count);
        Assert.Equal(1, versions[0].VersionNumber);
        Assert.Equal(2, versions[1].VersionNumber);
    }

    [Fact]
    public async Task GetByModelIdAndVersionNumberAsync_ReturnsCorrectVersion()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        _context.Models.Add(model);
        await _context.SaveChangesAsync();

        var version1 = ModelVersion.Create(model.Id, 1, "Version 1", DateTime.UtcNow);
        var version2 = ModelVersion.Create(model.Id, 2, "Version 2", DateTime.UtcNow.AddMinutes(1));
        await _versionRepository.AddAsync(version1);
        await _versionRepository.AddAsync(version2);

        // Act
        var result = await _versionRepository.GetByModelIdAndVersionNumberAsync(model.Id, 2);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(2, result.VersionNumber);
        Assert.Equal("Version 2", result.Description);
    }

    [Fact]
    public async Task GetLatestVersionNumberAsync_ReturnsHighestVersionNumber()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        _context.Models.Add(model);
        await _context.SaveChangesAsync();

        var version1 = ModelVersion.Create(model.Id, 1, "Version 1", DateTime.UtcNow);
        var version2 = ModelVersion.Create(model.Id, 2, "Version 2", DateTime.UtcNow.AddMinutes(1));
        var version3 = ModelVersion.Create(model.Id, 3, "Version 3", DateTime.UtcNow.AddMinutes(2));
        await _versionRepository.AddAsync(version1);
        await _versionRepository.AddAsync(version2);
        await _versionRepository.AddAsync(version3);

        // Act
        var latestVersionNumber = await _versionRepository.GetLatestVersionNumberAsync(model.Id);

        // Assert
        Assert.Equal(3, latestVersionNumber);
    }

    [Fact]
    public async Task GetLatestVersionNumberAsync_ReturnsZeroWhenNoVersions()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        _context.Models.Add(model);
        await _context.SaveChangesAsync();

        // Act
        var latestVersionNumber = await _versionRepository.GetLatestVersionNumberAsync(model.Id);

        // Assert
        Assert.Equal(0, latestVersionNumber);
    }

    [Fact]
    public async Task DeleteAsync_RemovesVersionFromDatabase()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        _context.Models.Add(model);
        await _context.SaveChangesAsync();

        var version = ModelVersion.Create(model.Id, 1, "Version to delete", DateTime.UtcNow);
        await _versionRepository.AddAsync(version);

        // Act
        await _versionRepository.DeleteAsync(version);

        // Assert
        var deletedVersion = await _context.ModelVersions.FindAsync(version.Id);
        Assert.Null(deletedVersion);
    }

    public void Dispose()
    {
        _context.Dispose();
    }
}
