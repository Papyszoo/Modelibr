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
    public void GetToolAvailability_MissingConfiguredPath_ReportsUnavailable()
    {
        // The packaged desktop runtime is a trimmed embedded PostgreSQL whose bin/
        // holds only initdb, pg_ctl and postgres. Pointing PG_DUMP_PATH at the bin
        // that does not exist must be reported as "tooling not shipped" so startup
        // can degrade instead of aborting.
        var (service, _) = NewService(new Dictionary<string, string?>
        {
            ["PG_DUMP_PATH"] = Path.Combine(Path.GetTempPath(), "definitely", "absent", "pg_dump"),
        });

        var availability = service.GetToolAvailability();

        Assert.False(availability.Available);
        Assert.Contains("pg_dump", availability.Reason);
    }

    [Fact]
    public void GetToolAvailability_BareNamesOnPath_AssumesAvailable()
    {
        // Docker/source mode resolves bare names through PATH; probing PATH here
        // would turn an ordinary missing system install into a silent skip.
        var (service, _) = NewService();

        Assert.True(service.GetToolAvailability().Available);
    }

    [Fact]
    public void GetToolAvailability_ExistingConfiguredPath_ReportsAvailable()
    {
        var tool = Path.Combine(Path.GetTempPath(), $"pg_dump_{Guid.NewGuid():N}");
        File.WriteAllText(tool, string.Empty);
        try
        {
            var (service, _) = NewService(new Dictionary<string, string?>
            {
                ["PG_DUMP_PATH"] = tool,
            });

            Assert.True(service.GetToolAvailability().Available);
        }
        finally
        {
            File.Delete(tool);
        }
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
    public void PostgresToolPaths_UseManagedPathsWhenConfigured()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["PG_DUMP_PATH"] = "/opt/modelibr/postgres/bin/pg_dump",
                ["PSQL_PATH"] = "/opt/modelibr/postgres/bin/psql",
            })
            .Build();

        var tools = BackupService.PostgresToolPaths.FromConfiguration(config);

        Assert.Equal("/opt/modelibr/postgres/bin/pg_dump", tools.PgDumpPath);
        Assert.Equal("/opt/modelibr/postgres/bin/psql", tools.PsqlPath);
    }

    [Fact]
    public void PostgresToolPaths_FallBackToPathLookupWhenUnset()
    {
        var config = new ConfigurationBuilder().Build();

        var tools = BackupService.PostgresToolPaths.FromConfiguration(config);

        Assert.Equal("pg_dump", tools.PgDumpPath);
        Assert.Equal("psql", tools.PsqlPath);
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
    public async Task CreateSnapshotAsync_FailureLeavesNoPublishedArchive()
    {
        var (service, backupRoot) = NewService(new Dictionary<string, string?>
        {
            ["PG_DUMP_PATH"] = "missing-pg-dump-for-test",
            ["PSQL_PATH"] = "missing-psql-for-test",
        });

        await Assert.ThrowsAnyAsync<Exception>(() => service.CreateSnapshotAsync(
            new BackupScope(IncludeThumbnails: false),
            BackupNaming.PreMigrationSnapshotPrefix,
            CancellationToken.None));

        Assert.Empty(Directory.GetFiles(backupRoot, "*.tar"));
        Assert.Empty(Directory.GetFiles(Path.Combine(backupRoot, ".tmp"), "*"));
    }
}
