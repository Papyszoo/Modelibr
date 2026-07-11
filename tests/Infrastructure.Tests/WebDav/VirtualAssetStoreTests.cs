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
            new Mock<IBlendFileGenerator>().Object,
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

    // ── Duplicate-name disambiguation (Allow policy allows real duplicates now) ──

    [Fact]
    public async Task GetCollectionAsync_TwoModelsWithSameName_PlainNameResolution_ReturnsNull()
    {
        // Arrange — two non-deleted models sharing a name is now legal under the
        // "Allow" duplicate-name policy. WebDAV must never guess which one a plain,
        // undisambiguated name refers to.
        var now = DateTime.UtcNow;
        var model1 = Model.Create("Chair", now);
        var model2 = Model.Create("Chair", now);
        _dbContext.Models.AddRange(model1, model2);
        await _dbContext.SaveChangesAsync();

        var uri = new Uri("http://localhost/Models/Chair");

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task GetCollectionAsync_TwoModelsWithSameName_IdSuffixedSegment_ResolvesTheExactModel()
    {
        // Arrange
        var now = DateTime.UtcNow;
        var model1 = Model.Create("Chair", now);
        var model2 = Model.Create("Chair", now);
        _dbContext.Models.AddRange(model1, model2);
        await _dbContext.SaveChangesAsync();

        var uri = new Uri($"http://localhost/Models/Chair%20%5B{model2.Id}%5D");

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<VirtualModelCollection>(result);
        Assert.Equal($"Chair [{model2.Id}]", result.Name);
    }

    [Fact]
    public async Task GetCollectionAsync_SingleModelNoCollision_ResolvesWithPlainName()
    {
        // Arrange
        var now = DateTime.UtcNow;
        var model = Model.Create("UniqueChair", now);
        _dbContext.Models.Add(model);
        await _dbContext.SaveChangesAsync();

        var uri = new Uri("http://localhost/Models/UniqueChair");

        // Act
        var result = await _store.GetCollectionAsync(uri, _mockHttpContext.Object);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("UniqueChair", result.Name);
    }

    // ── Physical path resolution (prompt 30, item 4): the resolved VirtualAssetFile
    // must read bytes from the persisted File.FilePath, never re-derive root/aa/bb/hash. ──

    [Fact]
    public async Task GetItemAsync_ModelVersionFile_StreamsFromPersistedFilePath_NotFromHashLayout()
    {
        // Arrange — a real upload root on disk, since this test exercises the resolved
        // VirtualAssetFile's actual stream, not just its type.
        var uploadRoot = Path.Combine(Path.GetTempPath(), "modelibr-store-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(uploadRoot);
        try
        {
            _mockPathProvider.Setup(p => p.UploadRootPath).Returns(uploadRoot);

            var now = DateTime.UtcNow;
            var model = Model.Create("Chair", now);
            var version = model.CreateVersion("v1", now);

            const string hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
            // Relative path deliberately does NOT match the hash-derived root/aa/bb/hash
            // layout, so a pass would only happen by honoring the persisted FilePath.
            var relativePath = "zz/yy/renamed-on-disk.glb";
            var file = Domain.Models.File.Create(
                "Chair.glb", "renamed-on-disk.glb", relativePath, "model/gltf-binary",
                Domain.ValueObjects.FileType.Glb, sizeBytes: 3, sha256Hash: hash, createdAt: now);
            version.AddFile(file);

            _dbContext.Models.Add(model);
            await _dbContext.SaveChangesAsync();

            var content = new byte[] { 7, 7, 7 };
            var fullPath = Path.Combine(uploadRoot, "zz", "yy", "renamed-on-disk.glb");
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
            await System.IO.File.WriteAllBytesAsync(fullPath, content);

            var uri = new Uri("http://localhost/Models/Chair/v1/Chair.glb");

            // Act
            var item = await _store.GetItemAsync(uri, _mockHttpContext.Object);

            // Assert
            var assetFile = Assert.IsType<VirtualAssetFile>(item);
            var stream = await assetFile.GetReadableStreamAsync(_mockHttpContext.Object);
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms);
            Assert.Equal(content, ms.ToArray());
        }
        finally
        {
            Directory.Delete(uploadRoot, recursive: true);
        }
    }
}
