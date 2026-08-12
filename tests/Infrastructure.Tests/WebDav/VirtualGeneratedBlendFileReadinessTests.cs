using Application.Abstractions.Services;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Tests.Fakes;
using Infrastructure.WebDav;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using NWebDav.Server.Http;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Tests.WebDav;

/// <summary>
/// Covers the generated-{name}.blend readiness rule: the virtual file must only ever be
/// exposed - in listings AND single-item resolution - once
/// IBlendFileGenerator.GetCachedSizeBytes confirms a cache file actually exists for
/// (modelId, newest non-deleted versionId). Exposing it before that means PROPFIND/HEAD
/// report a size (the source renderable file's) that the GET response can't back up -
/// exactly what corrupted the file on WebDAV clients that truncate reads to the
/// PROPFIND-reported length (e.g. macOS WebDAVFS). See VirtualGeneratedBlendFile.TryCreate.
/// </summary>
public class VirtualGeneratedBlendFileReadinessTests : IDisposable
{
    private readonly string _uploadRoot;
    private readonly FakeUploadPathProvider _pathProvider;
    private readonly FakeBlendFileGenerator _blendFileGenerator;
    private readonly ApplicationDbContext _dbContext;
    private readonly VirtualAssetStore _store;
    private readonly Mock<IHttpContext> _mockHttpContext = new();

    public VirtualGeneratedBlendFileReadinessTests()
    {
        _uploadRoot = Path.Combine(Path.GetTempPath(), "modelibr-blend-readiness-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_uploadRoot);

        _pathProvider = new FakeUploadPathProvider(_uploadRoot);
        _blendFileGenerator = new FakeBlendFileGenerator(_uploadRoot) { IsAvailable = true };

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _dbContext = new ApplicationDbContext(options);
        _dbContext.Database.EnsureCreated();

        var mockScopeFactory = new Mock<IServiceScopeFactory>();
        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        mockServiceProvider.Setup(sp => sp.GetService(typeof(ApplicationDbContext))).Returns(_dbContext);

        _store = new VirtualAssetStore(
            mockScopeFactory.Object,
            _pathProvider,
            new VirtualItemPropertyManager(),
            new VirtualCollectionPropertyManager(),
            new NoLockingManager(),
            new Mock<IAudioSelectionService>().Object,
            _blendFileGenerator,
            NullLogger<VirtualAssetStore>.Instance,
            NullLoggerFactory.Instance);
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        if (Directory.Exists(_uploadRoot))
            Directory.Delete(_uploadRoot, recursive: true);
    }

    private async Task<(Model model, ModelVersion version)> SeedRenderableModelAsync(string name = "Chair")
    {
        var now = DateTime.UtcNow;
        var model = Model.Create(name, now);
        var version = model.CreateVersion("v1", now);
        var file = DomainFile.Create(
            $"{name}.glb", "stored.glb", "aa/bb/renderable-hash", "model/gltf-binary",
            FileType.Glb, sizeBytes: 12_345, sha256Hash: "a" + new string('0', 63), createdAt: now);
        version.AddFile(file);

        _dbContext.Models.Add(model);
        await _dbContext.SaveChangesAsync();

        return (model, version);
    }

    [Fact]
    public async Task GetItemsAsync_NoCachedBlend_OmitsGeneratedBlendFromListing()
    {
        var (model, _) = await SeedRenderableModelAsync();

        var collection = await _store.GetCollectionAsync(new Uri($"http://localhost/Models/{model.Name}"), _mockHttpContext.Object);
        Assert.NotNull(collection);

        var items = await collection!.GetItemsAsync(_mockHttpContext.Object);

        Assert.DoesNotContain(items, i => i.Name == $"generated-{model.Name}.blend");
    }

    [Fact]
    public async Task GetItemAsync_NoCachedBlend_ReturnsNull()
    {
        var (model, _) = await SeedRenderableModelAsync();

        var item = await _store.GetItemAsync(
            new Uri($"http://localhost/Models/{model.Name}/generated-{model.Name}.blend"),
            _mockHttpContext.Object);

        Assert.Null(item);
    }

    [Fact]
    public async Task GetItemsAsync_CachedBlendExists_IncludesGeneratedBlendWithTrueCachedSize()
    {
        var (model, version) = await SeedRenderableModelAsync();
        var cachedContent = new byte[] { 1, 2, 3, 4, 5 };
        _blendFileGenerator.WriteCachedFile(model.Id, version.Id, cachedContent);

        var collection = await _store.GetCollectionAsync(new Uri($"http://localhost/Models/{model.Name}"), _mockHttpContext.Object);
        var items = (await collection!.GetItemsAsync(_mockHttpContext.Object)).ToList();

        var generated = Assert.Single(items, i => i.Name == $"generated-{model.Name}.blend");
        var generatedBlend = Assert.IsType<VirtualGeneratedBlendFile>(generated);

        // Must be the real cached size, never the source renderable file's (approximate) size.
        Assert.Equal(cachedContent.Length, generatedBlend.SizeBytes);
        Assert.NotEqual(12_345, generatedBlend.SizeBytes);
    }

    [Fact]
    public async Task GetItemAsync_CachedBlendExists_ResolvesWithTrueCachedSize()
    {
        var (model, version) = await SeedRenderableModelAsync();
        var cachedContent = new byte[] { 9, 9, 9 };
        _blendFileGenerator.WriteCachedFile(model.Id, version.Id, cachedContent);

        var item = await _store.GetItemAsync(
            new Uri($"http://localhost/Models/{model.Name}/generated-{model.Name}.blend"),
            _mockHttpContext.Object);

        var generatedBlend = Assert.IsType<VirtualGeneratedBlendFile>(item);
        Assert.Equal(cachedContent.Length, generatedBlend.SizeBytes);
    }

    [Fact]
    public async Task GetItemAsync_BlenderUnavailable_ReturnsNullEvenWithCachedBlend()
    {
        var (model, version) = await SeedRenderableModelAsync();
        _blendFileGenerator.WriteCachedFile(model.Id, version.Id, new byte[] { 1 });
        _blendFileGenerator.IsAvailable = false;

        var item = await _store.GetItemAsync(
            new Uri($"http://localhost/Models/{model.Name}/generated-{model.Name}.blend"),
            _mockHttpContext.Object);

        Assert.Null(item);
    }
}
