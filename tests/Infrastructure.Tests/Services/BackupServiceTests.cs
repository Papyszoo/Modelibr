using Application.Abstractions.Services;
using Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// Covers BackupService's pure filesystem bookkeeping (snapshot retention, filename
/// validation) - none of this needs a database, unlike CreateSnapshotAsync/
/// StartBackupAsync themselves, so it runs as a fast, non-Integration unit test against
/// a real temp directory. The safety constraint under test - automatic-snapshot cleanup
/// must never delete a user-initiated backup - is called out explicitly in the
/// pre-migration-backup spec, so it gets its own direct coverage here rather than only
/// being implied by the higher-level DatabaseExtensionsTests.
/// </summary>
public sealed class BackupServiceTests
{
    private static (BackupService service, string backupRoot) NewService(
        Dictionary<string, string?>? extraConfig = null)
    {
        var root = Path.Combine(Path.GetTempPath(), "modelibr_backup_tests", Path.GetRandomFileName());
        var values = new Dictionary<string, string?>
        {
            ["BACKUP_STORAGE_PATH"] = Path.Combine(root, "backups"),
            ["RESTORE_STORAGE_PATH"] = Path.Combine(root, "restore"),
            ["UPLOAD_STORAGE_PATH"] = Path.Combine(root, "uploads"),
            ["THUMBNAIL_STORAGE_PATH"] = Path.Combine(root, "thumbnails"),
        };
        if (extraConfig is not null)
        {
            foreach (var pair in extraConfig) values[pair.Key] = pair.Value;
        }

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var service = new BackupService(
            config,
            NullLogger<BackupService>.Instance,
            new BackupConsistencyGate());
        return (service, Path.Combine(root, "backups"));
    }

    private static void TouchFile(string backupRoot, string fileName)
    {
        File.WriteAllBytes(Path.Combine(backupRoot, fileName), new byte[] { 1, 2, 3 });
    }

    [Fact]
    public void CleanupSnapshots_KeepsNewestWithinPrefix_DeletesOlderOnes()
    {
        var (service, root) = NewService();
        TouchFile(root, "pre-migration-2026-01-01-000001.tar");
        TouchFile(root, "pre-migration-2026-01-02-000001.tar");
        TouchFile(root, "pre-migration-2026-01-03-000001.tar");
        TouchFile(root, "pre-migration-2026-01-04-000001.tar");

        service.CleanupSnapshots(BackupNaming.PreMigrationSnapshotPrefix, keepCount: 2);

        var remaining = Directory.GetFiles(root, "pre-migration-*.tar").Select(Path.GetFileName).ToHashSet();
        Assert.Equal(2, remaining.Count);
        Assert.Contains("pre-migration-2026-01-04-000001.tar", remaining);
        Assert.Contains("pre-migration-2026-01-03-000001.tar", remaining);
        Assert.DoesNotContain("pre-migration-2026-01-02-000001.tar", remaining);
        Assert.DoesNotContain("pre-migration-2026-01-01-000001.tar", remaining);
    }

    [Fact]
    public void CleanupSnapshots_NeverDeletesFilesOutsideThePrefix()
    {
        var (service, root) = NewService();
        // Manual, user-initiated backups - must survive no matter how aggressive the
        // retention count for the *different* automatic-snapshot prefix is.
        TouchFile(root, "modelibr-2026-01-01-000001.tar");
        TouchFile(root, "modelibr-2026-01-02-000001.tar");
        TouchFile(root, "pre-migration-2026-01-01-000001.tar");

        service.CleanupSnapshots(BackupNaming.PreMigrationSnapshotPrefix, keepCount: 0);

        var remaining = Directory.GetFiles(root, "*.tar").Select(Path.GetFileName).ToHashSet();
        Assert.Contains("modelibr-2026-01-01-000001.tar", remaining);
        Assert.Contains("modelibr-2026-01-02-000001.tar", remaining);
        Assert.DoesNotContain("pre-migration-2026-01-01-000001.tar", remaining);
    }

    [Fact]
    public void CleanupSnapshots_FewerFilesThanKeepCount_DeletesNothing()
    {
        var (service, root) = NewService();
        TouchFile(root, "pre-migration-2026-01-01-000001.tar");

        service.CleanupSnapshots(BackupNaming.PreMigrationSnapshotPrefix, keepCount: 3);

        Assert.True(File.Exists(Path.Combine(root, "pre-migration-2026-01-01-000001.tar")));
    }

    [Fact]
    public void ResolveBackupPath_AcceptsPreMigrationPrefix()
    {
        var (service, root) = NewService();
        TouchFile(root, "pre-migration-2026-01-01-000001.tar");

        var resolved = service.ResolveBackupPath("pre-migration-2026-01-01-000001.tar");

        Assert.NotNull(resolved);
        Assert.True(File.Exists(resolved));
    }

    [Fact]
    public void DeleteBackup_AcceptsPreMigrationPrefix()
    {
        var (service, root) = NewService();
        TouchFile(root, "pre-migration-2026-01-01-000001.tar");

        service.DeleteBackup("pre-migration-2026-01-01-000001.tar");

        Assert.False(File.Exists(Path.Combine(root, "pre-migration-2026-01-01-000001.tar")));
    }

    [Fact]
    public void ResolveBackupPath_RejectsNamesOutsideKnownPrefixes()
    {
        var (service, root) = NewService();
        TouchFile(root, "not-a-known-prefix-2026-01-01-000001.tar");

        var resolved = service.ResolveBackupPath("not-a-known-prefix-2026-01-01-000001.tar");

        Assert.Null(resolved);
    }

    [Fact]
    public void ListBackups_IncludesBothManualAndPreMigrationSnapshots()
    {
        var (service, root) = NewService();
        TouchFile(root, "modelibr-2026-01-01-000001.tar");
        TouchFile(root, "pre-migration-2026-01-02-000001.tar");

        var names = service.ListBackups().Select(b => b.FileName).ToHashSet();

        Assert.Contains("modelibr-2026-01-01-000001.tar", names);
        Assert.Contains("pre-migration-2026-01-02-000001.tar", names);
    }

    [Fact]
    public void FindMissingReferencedUploadPaths_RejectsMissingButAllowsUnreferencedFiles()
    {
        var root = Path.Combine(Path.GetTempPath(), "modelibr_backup_tests", Path.GetRandomFileName());
        var uploadRoot = Path.Combine(root, "uploads");
        Directory.CreateDirectory(Path.Combine(uploadRoot, "aa"));
        File.WriteAllBytes(Path.Combine(uploadRoot, "aa", "present"), new byte[] { 1 });
        File.WriteAllBytes(Path.Combine(uploadRoot, "aa", "extra"), new byte[] { 2 });

        var missing = BackupService.FindMissingReferencedUploadPaths(
            new[] { "aa/present", "aa/missing" },
            uploadRoot);

        Assert.Equal(new[] { "aa/missing" }, missing);
    }

    [Fact]
    public void ToUploadRelative_StripsWhateverTheUploadsRootIs()
    {
        var root = "/var/lib/modelibr/uploads";

        Assert.Equal("ab/cd/hash", BackupService.ToUploadRelative($"{root}/ab/cd/hash", root));
        // A different root - e.g. a native install - normalises the same way.
        Assert.Equal("ab/cd/hash", BackupService.ToUploadRelative("/home/me/modelibr/data/uploads/ab/cd/hash", "/home/me/modelibr/data/uploads"));
        // Already relative stays as it is.
        Assert.Equal("ab/cd/hash", BackupService.ToUploadRelative("ab/cd/hash", root));
        // Windows separators normalise to the sweep's forward slashes.
        Assert.Equal("ab/cd/hash", BackupService.ToUploadRelative("ab\\cd\\hash", root));
    }

    [Fact]
    public void ToUploadRelative_PathOutsideTheRoot_IsReturnedNormalisedUnchanged()
    {
        var root = "/var/lib/modelibr/uploads";

        Assert.Equal("/somewhere/else/file.png", BackupService.ToUploadRelative("/somewhere/else/file.png", root));
    }

    [Fact]
    public async Task CreateSnapshotAsync_UnreachableDatabase_LeavesNoPublishedArchive()
    {
        // A backup that cannot reach the database must fail without publishing a
        // half-written archive. This used to be expressed as a missing pg_dump
        // binary; the driver is the dependency now, so the same guarantee is
        // asserted by pointing the service at a port nothing is listening on.
        var (service, backupRoot) = NewService(new Dictionary<string, string?>
        {
            ["POSTGRES_HOST"] = "127.0.0.1",
            ["POSTGRES_PORT"] = "1",
            ["POSTGRES_DB"] = "Modelibr",
            ["POSTGRES_USER"] = "modelibr",
            ["POSTGRES_PASSWORD"] = "modelibr",
        });

        await Assert.ThrowsAnyAsync<Exception>(() => service.CreateSnapshotAsync(
            new BackupScope(IncludeThumbnails: false),
            BackupNaming.PreMigrationSnapshotPrefix,
            CancellationToken.None));

        Assert.Empty(Directory.GetFiles(backupRoot, "*.tar"));
        Assert.Empty(Directory.GetFiles(Path.Combine(backupRoot, ".tmp"), "*"));
    }
}
