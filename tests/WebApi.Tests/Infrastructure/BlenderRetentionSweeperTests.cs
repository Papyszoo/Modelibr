using Application.Abstractions.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using WebApi.Infrastructure;
using Xunit;

namespace WebApi.Tests.Infrastructure;

/// <summary>
/// Covers prompt 30 item 5: bounded retention for webdav-blend-temp/ (aged-out entries
/// are quarantined, never deleted — see <see cref="BlenderRetentionSweeper"/>'s remarks
/// for why) and webdav-blend-orphans/ (aged-out entries are actually deleted — this is
/// the one place bytes disappear). Exercises the sweep logic directly, with an explicit
/// "now", rather than spinning up the hosted service's 24h timer.
/// </summary>
public class BlenderRetentionSweeperTests : IDisposable
{
    private readonly string _uploadRoot;
    private readonly FakeUploadPathProvider _pathProvider;
    private readonly BlenderRetentionSweeper _sweeper;

    private static readonly DateTime Now = new(2026, 7, 10, 12, 0, 0, DateTimeKind.Utc);

    public BlenderRetentionSweeperTests()
    {
        _uploadRoot = Path.Combine(Path.GetTempPath(), "modelibr-retention-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_uploadRoot);
        _pathProvider = new FakeUploadPathProvider(_uploadRoot);
        var quarantine = new BlenderTempFileQuarantine(_pathProvider, NullLogger.Instance);
        _sweeper = new BlenderRetentionSweeper(_pathProvider, quarantine, NullLogger.Instance);
    }

    public void Dispose()
    {
        if (Directory.Exists(_uploadRoot))
            Directory.Delete(_uploadRoot, recursive: true);
    }

    private string TempDir => Path.Combine(_uploadRoot, "webdav-blend-temp");
    private string OrphanDir => Path.Combine(_uploadRoot, "webdav-blend-orphans");

    private string CreateTempFile(string name, TimeSpan age)
    {
        Directory.CreateDirectory(TempDir);
        var path = Path.Combine(TempDir, name);
        File.WriteAllBytes(path, [1, 2, 3]);
        File.SetLastWriteTimeUtc(path, Now - age);
        return path;
    }

    private void CreateOrphanPair(string baseName, TimeSpan age)
    {
        Directory.CreateDirectory(OrphanDir);
        var blendPath = Path.Combine(OrphanDir, $"{baseName}.blend");
        var sidecarPath = Path.Combine(OrphanDir, $"{baseName}.json");
        File.WriteAllBytes(blendPath, [4, 5, 6]);
        File.WriteAllText(sidecarPath, "{}");
        File.SetLastWriteTimeUtc(blendPath, Now - age);
        File.SetLastWriteTimeUtc(sidecarPath, Now - age);
    }

    [Fact]
    public async Task SweepAsync_TempFileOlderThan24Hours_IsQuarantinedToOrphans_NotDeleted()
    {
        var tempFile = CreateTempFile("stale-key", BlenderRetentionSweeper.TempFileMaxAge + TimeSpan.FromMinutes(1));

        var result = await _sweeper.SweepAsync(Now, CancellationToken.None);

        Assert.Equal(1, result.TempQuarantined);
        Assert.False(File.Exists(tempFile), "Aged-out temp file must be moved out of webdav-blend-temp.");
        Assert.True(Directory.Exists(OrphanDir), "Quarantine must land in webdav-blend-orphans.");
        Assert.Single(Directory.GetFiles(OrphanDir, "*.blend"));
        // Never deleted outright: the bytes must exist somewhere under uploads/.
        Assert.Single(Directory.GetFiles(OrphanDir, "*.json"));
    }

    [Fact]
    public async Task SweepAsync_TempFileYoungerThan24Hours_IsLeftInPlace()
    {
        var tempFile = CreateTempFile("fresh-key", TimeSpan.FromHours(1));

        var result = await _sweeper.SweepAsync(Now, CancellationToken.None);

        Assert.Equal(0, result.TempQuarantined);
        Assert.Equal(1, result.TempSkipped);
        Assert.True(File.Exists(tempFile), "Fresh temp file must not be touched.");
    }

    [Fact]
    public async Task SweepAsync_OrphanOlderThan30Days_DeletesBothBlendAndSidecar()
    {
        CreateOrphanPair("old-orphan", BlenderRetentionSweeper.OrphanMaxAge + TimeSpan.FromDays(1));

        var result = await _sweeper.SweepAsync(Now, CancellationToken.None);

        Assert.Equal(2, result.OrphansDeleted); // .blend + .json
        Assert.False(File.Exists(Path.Combine(OrphanDir, "old-orphan.blend")));
        Assert.False(File.Exists(Path.Combine(OrphanDir, "old-orphan.json")));
    }

    [Fact]
    public async Task SweepAsync_OrphanYoungerThan30Days_IsLeftInPlace()
    {
        CreateOrphanPair("recent-orphan", TimeSpan.FromDays(5));

        var result = await _sweeper.SweepAsync(Now, CancellationToken.None);

        Assert.Equal(0, result.OrphansDeleted);
        Assert.Equal(2, result.OrphansSkipped);
        Assert.True(File.Exists(Path.Combine(OrphanDir, "recent-orphan.blend")));
        Assert.True(File.Exists(Path.Combine(OrphanDir, "recent-orphan.json")));
    }

    [Fact]
    public async Task SweepAsync_MixedAges_OnlyTouchesAgedOutEntries()
    {
        var freshTemp = CreateTempFile("fresh", TimeSpan.FromHours(2));
        var staleTemp = CreateTempFile("stale", TimeSpan.FromHours(30));
        CreateOrphanPair("fresh-orphan", TimeSpan.FromDays(10));
        CreateOrphanPair("stale-orphan", TimeSpan.FromDays(45));

        var result = await _sweeper.SweepAsync(Now, CancellationToken.None);

        Assert.True(File.Exists(freshTemp));
        Assert.False(File.Exists(staleTemp));
        Assert.True(File.Exists(Path.Combine(OrphanDir, "fresh-orphan.blend")));
        Assert.False(File.Exists(Path.Combine(OrphanDir, "stale-orphan.blend")));
        Assert.Equal(1, result.TempQuarantined);
        Assert.Equal(1, result.TempSkipped);
        Assert.Equal(2, result.OrphansDeleted); // the pre-existing stale-orphan pair
        // Skipped = the pre-existing fresh-orphan pair (2) PLUS the pair the temp sweep
        // just quarantined into orphans this same pass (2) — it's brand new, so the
        // orphan sweep correctly leaves it alone rather than deleting same-pass output.
        Assert.Equal(4, result.OrphansSkipped);
        Assert.Equal(0, result.Errors);
    }

    [Fact]
    public async Task SweepAsync_NeitherDirectoryExists_ReturnsZeroesAndDoesNotThrow()
    {
        var result = await _sweeper.SweepAsync(Now, CancellationToken.None);

        Assert.Equal(0, result.TempQuarantined);
        Assert.Equal(0, result.TempSkipped);
        Assert.Equal(0, result.OrphansDeleted);
        Assert.Equal(0, result.OrphansSkipped);
        Assert.Equal(0, result.Errors);
    }

    private sealed class FakeUploadPathProvider(string uploadRootPath) : IUploadPathProvider
    {
        public string UploadRootPath { get; } = uploadRootPath;
    }
}
