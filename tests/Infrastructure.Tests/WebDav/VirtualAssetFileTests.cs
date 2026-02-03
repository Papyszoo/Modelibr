using Application.Abstractions.Storage;
using Infrastructure.WebDav;
using Moq;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Stores;
using Xunit;

namespace Infrastructure.Tests.WebDav;

public class VirtualAssetFileTests
{
    private readonly Mock<IUploadPathProvider> _mockPathProvider;
    private readonly Mock<IHttpContext> _mockHttpContext;
    private readonly VirtualItemPropertyManager _propertyManager;
    private readonly NoLockingManager _lockingManager;

    public VirtualAssetFileTests()
    {
        _mockPathProvider = new Mock<IUploadPathProvider>();
        _mockPathProvider.Setup(p => p.UploadRootPath).Returns("/tmp/uploads");
        _mockHttpContext = new Mock<IHttpContext>();
        _propertyManager = new VirtualItemPropertyManager();
        _lockingManager = new NoLockingManager();
    }

    [Fact]
    public void Constructor_SetsPropertiesCorrectly()
    {
        // Arrange
        var name = "model.glb";
        var sha256Hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        var sizeBytes = 1024L;
        var mimeType = "model/gltf-binary";
        var createdAt = DateTime.UtcNow;
        var updatedAt = DateTime.UtcNow;

        // Act
        var file = new VirtualAssetFile(
            _propertyManager,
            _lockingManager,
            name,
            sha256Hash,
            sizeBytes,
            mimeType,
            createdAt,
            updatedAt,
            _mockPathProvider.Object);

        // Assert
        Assert.Equal(name, file.Name);
        Assert.Equal($"asset:{sha256Hash}", file.UniqueKey);
        Assert.Equal(sha256Hash, file.Sha256Hash);
        Assert.Equal(sizeBytes, file.SizeBytes);
        Assert.Equal(mimeType, file.MimeType);
        Assert.Equal(createdAt, file.CreatedAt);
        Assert.Equal(updatedAt, file.UpdatedAt);
    }

    [Fact]
    public async Task UploadFromStreamAsync_ReturnsForbidden()
    {
        // Arrange
        var file = CreateTestFile();
        using var stream = new MemoryStream();

        // Act
        var result = await file.UploadFromStreamAsync(_mockHttpContext.Object, stream);

        // Assert
        Assert.Equal(DavStatusCode.Forbidden, result);
    }

    [Fact]
    public async Task CopyAsync_ReturnsForbidden()
    {
        // Arrange
        var file = CreateTestFile();
        var mockDestination = new Mock<IStoreCollection>();

        // Act
        var result = await file.CopyAsync(mockDestination.Object, "newname.glb", false, _mockHttpContext.Object);

        // Assert
        Assert.Equal(DavStatusCode.Forbidden, result.Result);
    }

    [Fact]
    public async Task GetReadableStreamAsync_NonExistentFile_ReturnsNullStream()
    {
        // Arrange
        var file = CreateTestFile();

        // Act
        var stream = await file.GetReadableStreamAsync(_mockHttpContext.Object);

        // Assert
        Assert.Same(Stream.Null, stream);
    }

    private VirtualAssetFile CreateTestFile()
    {
        return new VirtualAssetFile(
            _propertyManager,
            _lockingManager,
            "test.glb",
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            1024L,
            "model/gltf-binary",
            DateTime.UtcNow,
            DateTime.UtcNow,
            _mockPathProvider.Object);
    }
}
