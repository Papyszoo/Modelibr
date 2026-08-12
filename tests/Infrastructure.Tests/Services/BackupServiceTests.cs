using Application.Abstractions.Services;
using Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// Covers BackupService's pure filesystem bookkeeping (snapshot retention, filename
/// validation) - none of this needs Postgres or `pg_dump`, unlike CreateSnapshotAsync/
/// StartBackupAsync themselves, so it runs as a fast, non-Integration unit test against
/// a real temp directory. The safety constraint under test - automatic-snapshot cleanup
/// must never delete a user-initiated backup - is called out explicitly in the
/// pre-migration-backup spec, so it gets its own direct coverage here rather than only
/// being implied by the higher-level DatabaseExtensionsTests.
/// </summary>
public sealed class BackupServiceTests
{
    private static (BackupService service, string backupRoot) NewService()
    {
        var root = Path.Combine(Path.GetTempPath(), "modelibr_backup_tests", Path.GetRandomFileName());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["BACKUP_STORAGE_PATH"] = Path.Combine(root, "backups"),
                ["RESTORE_STORAGE_PATH"] = Path.Combine(root, "restore"),
                ["UPLOAD_STORAGE_PATH"] = Path.Combine(root, "uploads"),
                ["THUMBNAIL_STORAGE_PATH"] = Path.Combine(root, "thumbnails"),
            })
            .Build();

        var service = new BackupService(config, NullLogger<BackupService>.Instance);
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
}
