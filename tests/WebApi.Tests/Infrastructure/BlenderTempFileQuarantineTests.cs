using System.Text.Json;
using Application.Abstractions.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using WebApi.Infrastructure;
using Xunit;

namespace WebApi.Tests.Infrastructure;

public class BlenderTempFileQuarantineTests : IDisposable
{
    private readonly string _uploadRoot;
    private readonly FakeUploadPathProvider _pathProvider;
    private readonly BlenderTempFileQuarantine _quarantine;

    public BlenderTempFileQuarantineTests()
    {
        _uploadRoot = Path.Combine(Path.GetTempPath(), "modelibr-quarantine-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_uploadRoot);
        _pathProvider = new FakeUploadPathProvider(_uploadRoot);
        _quarantine = new BlenderTempFileQuarantine(_pathProvider, NullLogger.Instance);
    }

    public void Dispose()
    {
        if (Directory.Exists(_uploadRoot))
            Directory.Delete(_uploadRoot, recursive: true);
    }

    private string CreateTempFile(byte[]? content = null)
    {
        var tempDir = Path.Combine(_uploadRoot, "webdav-blend-temp");
        Directory.CreateDirectory(tempDir);
        var path = Path.Combine(tempDir, Guid.NewGuid().ToString("N") + ".tmp");
        File.WriteAllBytes(path, content ?? [0x42, 0x4C, 0x45, 0x4E, 0x44, 0x45, 0x52]);
        return path;
    }

    [Fact]
    public async Task QuarantineAsync_MovesTempFileToOrphanDirectory_NeverDeletesTheBytes()
    {
        var tempFile = CreateTempFile();

        await _quarantine.QuarantineAsync(
            tempFile,
            requestPath: "/modelibr/Models/Chair/uploaded-Chair.blend@",
            reason: "unresolvable model path",
            candidateModelIds: null,
            CancellationToken.None);

        Assert.False(File.Exists(tempFile), "The temp file must be moved out of the temp directory, not copied.");

        var orphanDir = Path.Combine(_uploadRoot, "webdav-blend-orphans");
        var orphanFiles = Directory.GetFiles(orphanDir, "*.blend");
        Assert.Single(orphanFiles);
    }

    [Fact]
    public async Task QuarantineAsync_WritesSidecarWithReasonAndOriginalPath()
    {
        var tempFile = CreateTempFile();

        await _quarantine.QuarantineAsync(
            tempFile,
            requestPath: "/modelibr/Models/Chair/uploaded-Chair.blend@",
            reason: "ambiguous model name",
            candidateModelIds: new[] { 42, 57 },
            CancellationToken.None);

        var orphanDir = Path.Combine(_uploadRoot, "webdav-blend-orphans");
        var sidecarPath = Directory.GetFiles(orphanDir, "*.json").Single();

        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(sidecarPath));
        var root = doc.RootElement;

        Assert.Equal("/modelibr/Models/Chair/uploaded-Chair.blend@", root.GetProperty("originalRequestPath").GetString());
        Assert.Equal("ambiguous model name", root.GetProperty("reason").GetString());
        Assert.True(root.TryGetProperty("timestampUtc", out _));

        var candidateIds = root.GetProperty("candidateModelIds").EnumerateArray().Select(e => e.GetInt32()).ToList();
        Assert.Equal(new[] { 42, 57 }, candidateIds);
    }

    [Fact]
    public async Task QuarantineAsync_NoCandidateIds_WritesEmptyArray()
    {
        var tempFile = CreateTempFile();

        await _quarantine.QuarantineAsync(
            tempFile,
            requestPath: "/modelibr/Models/Chair/uploaded-Chair.blend@",
            reason: "unresolvable model path",
            candidateModelIds: null,
            CancellationToken.None);

        var orphanDir = Path.Combine(_uploadRoot, "webdav-blend-orphans");
        var sidecarPath = Directory.GetFiles(orphanDir, "*.json").Single();

        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(sidecarPath));
        Assert.Empty(doc.RootElement.GetProperty("candidateModelIds").EnumerateArray());
    }

    [Fact]
    public async Task QuarantineAsync_PreservesOrphanFileContent()
    {
        var content = new byte[] { 0x01, 0x02, 0x03, 0x04 };
        var tempFile = CreateTempFile(content);

        await _quarantine.QuarantineAsync(
            tempFile,
            requestPath: "/modelibr/Models/Chair/uploaded-Chair.blend@",
            reason: "unresolvable model path",
            candidateModelIds: null,
            CancellationToken.None);

        var orphanDir = Path.Combine(_uploadRoot, "webdav-blend-orphans");
        var orphanFile = Directory.GetFiles(orphanDir, "*.blend").Single();

        Assert.Equal(content, await File.ReadAllBytesAsync(orphanFile));
    }

    [Fact]
    public async Task QuarantineAsync_WhenTempFileMissing_DoesNotThrow_AndCreatesNoOrphan()
    {
        var missingPath = Path.Combine(_uploadRoot, "webdav-blend-temp", "does-not-exist.tmp");

        var exception = await Record.ExceptionAsync(() => _quarantine.QuarantineAsync(
            missingPath,
            requestPath: "/modelibr/Models/Chair/uploaded-Chair.blend@",
            reason: "unresolvable model path",
            candidateModelIds: null,
            CancellationToken.None));

        Assert.Null(exception);

        var orphanDir = Path.Combine(_uploadRoot, "webdav-blend-orphans");
        Assert.False(Directory.Exists(orphanDir));
    }

    private sealed class FakeUploadPathProvider(string uploadRootPath) : IUploadPathProvider
    {
        public string UploadRootPath { get; } = uploadRootPath;
    }
}
