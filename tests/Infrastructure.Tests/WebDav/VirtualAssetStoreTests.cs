using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.WebDav;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using NWebDav.Server.Http;
using Xunit;

namespace Infrastructure.Tests.WebDav;

public class VirtualAssetStoreTests : IDisposable
{
    private readonly Mock<IServiceScopeFactory> _mockScopeFactory;
    private readonly Mock<IServiceScope> _mockScope;
    private readonly Mock<IServiceProvider> _mockServiceProvider;
    private readonly Mock<IUploadPathProvider> _mockPathProvider;
    private readonly Mock<IProjectRepository> _mockProjectRepository;
    private readonly Mock<ISoundCategoryRepository> _mockSoundCategoryRepository;
    private readonly Mock<ISoundRepository> _mockSoundRepository;
    private readonly Mock<IAudioSelectionService> _mockAudioSelectionService;
    private readonly Mock<IHttpContext> _mockHttpContext;
    private readonly Mock<ILogger<VirtualAssetStore>> _mockLogger;
    private readonly ApplicationDbContext _dbContext;
    private readonly VirtualAssetStore _store;

    public VirtualAssetStoreTests()
    {
        _mockScopeFactory = new Mock<IServiceScopeFactory>();
        _mockScope = new Mock<IServiceScope>();
        _mockServiceProvider = new Mock<IServiceProvider>();
        _mockPathProvider = new Mock<IUploadPathProvider>();
        _mockProjectRepository = new Mock<IProjectRepository>();
        _mockSoundCategoryRepository = new Mock<ISoundCategoryRepository>();
        _mockSoundRepository = new Mock<ISoundRepository>();
        _mockAudioSelectionService = new Mock<IAudioSelectionService>();
        _mockHttpContext = new Mock<IHttpContext>();
        _mockLogger = new Mock<ILogger<VirtualAssetStore>>();

        // Create in-memory database for testing
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _dbContext = new ApplicationDbContext(options);
        _dbContext.Database.EnsureCreated();

        _mockPathProvider.Setup(p => p.UploadRootPath).Returns("/tmp/uploads");
        
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(_mockScope.Object);
        _mockScope.Setup(s => s.ServiceProvider).Returns(_mockServiceProvider.Object);
        
        _mockServiceProvider.Setup(sp => sp.GetService(typeof(IProjectRepository)))
            .Returns(_mockProjectRepository.Object);
        _mockServiceProvider.Setup(sp => sp.GetService(typeof(ISoundCategoryRepository)))
            .Returns(_mockSoundCategoryRepository.Object);
        _mockServiceProvider.Setup(sp => sp.GetService(typeof(ISoundRepository)))
            .Returns(_mockSoundRepository.Object);
        _mockServiceProvider.Setup(sp => sp.GetService(typeof(ApplicationDbContext)))
            .Returns(_dbContext);

        var itemPropertyManager = new VirtualItemPropertyManager();
        var collectionPropertyManager = new VirtualCollectionPropertyManager();
        var lockingManager = new NoLockingManager();

        _store = new VirtualAssetStore(
            _mockScopeFactory.Object,
            _mockPathProvider.Object,
            itemPropertyManager,
            collectionPropertyManager,
            lockingManager,
            _mockAudioSelectionService.Object,
            _mockLogger.Object,
            new Microsoft.Extensions.Logging.Abstractions.NullLoggerFactory());
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }

    [Fact]
    public async Task GetCollectionAsync_RootPath_ReturnsRootCollection()
    {
        // Arrange - URI path after /dav prefix is stripped
        var uri = new Uri("http://localhost/");

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<VirtualRootCollection>(result);
        Assert.Equal("root", result.UniqueKey);
    }

    [Fact]
    public async Task GetCollectionAsync_ProjectsPath_ReturnsProjectsCollection()
    {
        // Arrange - URI path after /dav prefix is stripped
        var uri = new Uri("http://localhost/Projects");
        var projects = new List<Project>();
        _mockProjectRepository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(projects);

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<VirtualProjectsCollection>(result);
        Assert.Equal("projects", result.UniqueKey);
    }

    [Fact]
    public async Task GetCollectionAsync_SoundsPath_ReturnsSoundCategoriesCollection()
    {
        // Arrange - URI path after /dav prefix is stripped
        var uri = new Uri("http://localhost/Sounds");
        var categories = new List<SoundCategory>();
        _mockSoundCategoryRepository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(categories);

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<VirtualSoundCategoriesCollection>(result);
        Assert.Equal("soundcategories", result.UniqueKey);
    }

    [Fact]
    public async Task GetCollectionAsync_UnknownPath_ReturnsNull()
    {
        // Arrange - URI path after /dav prefix is stripped
        var uri = new Uri("http://localhost/Unknown");

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task GetItemAsync_RootPath_ReturnsRootCollection()
    {
        // Arrange - URI path after /dav prefix is stripped
        var uri = new Uri("http://localhost/");

        // Act
        var result = await _store.GetItemAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<VirtualRootCollection>(result);
    }

    [Fact]
    public async Task GetCollectionAsync_ProjectByName_ReturnsProjectCollection()
    {
        // Arrange - URI path after /dav prefix is stripped
        var projectName = "TestProject";
        var uri = new Uri($"http://localhost/Projects/{projectName}");
        var project = Project.Create(projectName, "Test Description", DateTime.UtcNow);
        
        // Add project to in-memory database
        _dbContext.Projects.Add(project);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<VirtualProjectCollection>(result);
        Assert.Equal(projectName, result.Name);
    }

    [Fact]
    public async Task GetCollectionAsync_NonExistentProject_ReturnsNull()
    {
        // Arrange - URI path after /dav prefix is stripped
        var projectName = "NonExistent";
        var uri = new Uri($"http://localhost/Projects/{projectName}");
        
        // No project added to database - it should not exist

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.Null(result);
    }
}
