using Application.Abstractions.Storage;
using Infrastructure.WebDav;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using NWebDav.Server.Http;
using Xunit;

namespace Infrastructure.Tests.WebDav;

/// <summary>
/// Covers prompt 30 items 3 and 4 for <see cref="VirtualAssetFile"/>:
/// - a missing physical blob must yield <see cref="Stream.Null"/> (which
///   CustomWebDavHandler turns into a 404), never a bogus empty/zero-length stream
///   written to the response.
/// - the physical path is resolved from the persisted relative path passed into the
///   constructor, not re-derived from the hash.
/// </summary>
public class VirtualAssetFileTests : IDisposable
{
    private readonly string _uploadRoot;
    private readonly Mock<IUploadPathProvider> _pathProvider;
    private readonly Mock<IHttpContext> _httpContext = new();

    public VirtualAssetFileTests()
    {
        _uploadRoot = Path.Combine(Path.GetTempPath(), "modelibr-vaf-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_uploadRoot);
        _pathProvider = new Mock<IUploadPathProvider>();
        _pathProvider.Setup(p => p.UploadRootPath).Returns(_uploadRoot);
    }

    public void Dispose()
    {
        if (Directory.Exists(_uploadRoot))
            Directory.Delete(_uploadRoot, recursive: true);
    }

    private VirtualAssetFile CreateFile(string relativePath, string sha256Hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")
    {
        return new VirtualAssetFile(
            new VirtualItemPropertyManager(),
            new NoLockingManager(),
            "asset.glb",
            sha256Hash,
            relativePath,
            sizeBytes: 1234,
            mimeType: "model/gltf-binary",
            createdAt: DateTime.UtcNow,
            updatedAt: DateTime.UtcNow,
            _pathProvider.Object);
    }

    [Fact]
    public async Task GetReadableStreamAsync_PhysicalFileMissing_ReturnsStreamNull_NotAnEmptyStream()
    {
        // The relative path is well-formed, but nothing was ever written to disk there.
        var file = CreateFile(Path.Combine("ab", "cd", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"));

        var stream = await file.GetReadableStreamAsync(_httpContext.Object);

        // CustomWebDavHandler.WriteFileAsync checks ReferenceEquals(stream, Stream.Null)
        // to decide whether to answer 404 — a merely-empty MemoryStream would NOT trigger
        // that check and would instead produce a bogus 200 with a zero-length body. The
        // reference-equality is the actual contract; assert it explicitly.
        Assert.True(ReferenceEquals(stream, Stream.Null));
    }

    [Fact]
    public async Task GetReadableStreamAsync_PhysicalFileMissing_LogsAtErrorLevel()
    {
        var loggedError = false;
        var logger = new TestLogger(() => loggedError = true);

        var file = new VirtualAssetFile(
            new VirtualItemPropertyManager(),
            new NoLockingManager(),
            "asset.glb",
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            Path.Combine("ab", "cd", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"),
            sizeBytes: 1234,
            mimeType: "model/gltf-binary",
            createdAt: DateTime.UtcNow,
            updatedAt: DateTime.UtcNow,
            _pathProvider.Object,
            logger);

        await file.GetReadableStreamAsync(_httpContext.Object);

        Assert.True(loggedError, "Missing physical blob must log at Error level.");
    }

    [Fact]
    public async Task GetReadableStreamAsync_ResolvesFromPersistedRelativePath_NotFromHashLayout()
    {
        // Deliberately mismatched: the hash's own root/aa/bb/hash layout location is left
        // empty, and the bytes instead live at the (unrelated) persisted RelativePath —
        // proving physical resolution comes from RelativePath, not re-derived hash math.
        const string hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
        var relativePath = Path.Combine("custom-bucket", "nested", "renamed-blob.bin");
        var fullPath = Path.Combine(_uploadRoot, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        var content = new byte[] { 1, 2, 3, 4, 5 };
        await File.WriteAllBytesAsync(fullPath, content);

        // Confirm the hash-layout location genuinely has nothing at it.
        var hashLayoutPath = Path.Combine(_uploadRoot, hash[..2], hash[2..4], hash);
        Assert.False(File.Exists(hashLayoutPath));

        var file = CreateFile(relativePath, hash);

        var stream = await file.GetReadableStreamAsync(_httpContext.Object);
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms);

        Assert.Equal(content, ms.ToArray());
    }

    [Fact]
    public async Task GetReadableStreamAsync_PhysicalFilePresent_ReturnsItsContent()
    {
        var relativePath = Path.Combine("ab", "cd", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789");
        var fullPath = Path.Combine(_uploadRoot, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        var content = new byte[] { 9, 8, 7 };
        await File.WriteAllBytesAsync(fullPath, content);

        var file = CreateFile(relativePath);

        var stream = await file.GetReadableStreamAsync(_httpContext.Object);
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms);

        Assert.Equal(content, ms.ToArray());
    }

    /// <summary>Minimal ILogger that reports whether LogError was ever called.</summary>
    private sealed class TestLogger : Microsoft.Extensions.Logging.ILogger
    {
        private readonly Action _onError;
        public TestLogger(Action onError) => _onError = onError;

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;

        public void Log<TState>(
            Microsoft.Extensions.Logging.LogLevel logLevel,
            Microsoft.Extensions.Logging.EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (logLevel == Microsoft.Extensions.Logging.LogLevel.Error)
                _onError();
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
