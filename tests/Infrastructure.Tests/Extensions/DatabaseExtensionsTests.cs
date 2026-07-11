using Application.Abstractions.Services;
using Infrastructure.Extensions;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Npgsql;
using Xunit;

namespace Infrastructure.Tests.Extensions;

/// <summary>
/// Covers the pre-migration-backup gate added to
/// <see cref="DatabaseExtensions.InitializeDatabaseAsync(IServiceProvider)"/>: pending
/// migrations must trigger an automatic backup BEFORE MigrateAsync runs, a failed backup
/// must abort startup before any schema change, and the opt-out env var must bypass the
/// backup while still letting migrations proceed.
///
/// Requires a real PostgreSQL instance (GetPendingMigrationsAsync/MigrateAsync are
/// relational-only — the InMemory provider used by other Infrastructure.Tests doesn't
/// support them). Runs against localhost:5432, matching WebApi.Tests'
/// <c>ModelibrWebFactory</c> credentials. Each test instance gets its OWN uniquely
/// named database (created in InitializeAsync, dropped in DisposeAsync) rather than
/// sharing one fixed name — the dev Postgres container this targets is also the shared
/// backend-integration/backup-restore-e2e database, potentially touched by other
/// suites/worktrees at the same time, and Npgsql pools physical connections per exact
/// connection-string text, so reusing one fixed database name across instances was
/// observed to race a DROP/CREATE cycle against a still-in-flight MigrateAsync from a
/// different instance and kill it with "terminating connection due to administrator
/// command". A unique name per instance removes any possibility of that collision.
///
/// <see cref="IBackupService"/> is mocked — this suite intentionally does NOT depend on
/// `pg_dump`/`psql` being on PATH (they usually aren't on a bare dev machine or CI
/// runner; only the backup-restore-e2e Docker image guarantees them). The real backup
/// pipeline (pg_dump succeeding, archive contents) is covered by
/// tests/backup-restore-e2e instead — this suite only covers the orchestration
/// contract: does the migration path actually call the backup and respect its outcome.
/// </summary>
[Trait("Category", "Integration")]
public sealed class DatabaseExtensionsTests : IAsyncLifetime
{
    private const string Host = "localhost";
    private const int Port = 5432;
    private const string Username = "modelibr";
    private const string Password = "ChangeThisStrongPassword123!";

    // Unique per test instance (xUnit creates a fresh instance per [Fact]) — see the
    // class remarks for why a shared fixed name isn't safe here.
    private readonly string _testDatabase = $"Modelibr_PreMigrationBackupTests_{Guid.NewGuid():N}";

    private static readonly string AdminConnectionString =
        $"Host={Host};Port={Port};Database=postgres;Username={Username};Password={Password};";

    private string TestConnectionString =>
        $"Host={Host};Port={Port};Database={_testDatabase};Username={Username};Password={Password};";

    public async Task InitializeAsync()
    {
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();

        await using var create = conn.CreateCommand();
        create.CommandText = $"CREATE DATABASE \"{_testDatabase}\";";
        await create.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        try
        {
            // Npgsql pools physical connections; force them closed so DROP DATABASE
            // (which requires zero connections) doesn't have to wait/fail on one this
            // test instance itself opened and returned to the pool.
            NpgsqlConnection.ClearPool(new NpgsqlConnection(TestConnectionString));

            await using var conn = new NpgsqlConnection(AdminConnectionString);
            await conn.OpenAsync();

            await using var terminate = conn.CreateCommand();
            terminate.CommandText = $"""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '{_testDatabase}' AND pid <> pg_backend_pid();
                """;
            await terminate.ExecuteNonQueryAsync();

            await using var drop = conn.CreateCommand();
            drop.CommandText = $"DROP DATABASE IF EXISTS \"{_testDatabase}\";";
            await drop.ExecuteNonQueryAsync();
        }
        catch
        {
            // Best-effort cleanup — a CI runner without Postgres shouldn't fail teardown
            // on top of the real failure.
        }
    }

    private ServiceProvider BuildProvider(IBackupService backupService, Dictionary<string, string?>? extraConfig = null)
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddProvider(NullLoggerProvider.Instance));

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(extraConfig ?? new Dictionary<string, string?>())
            .Build();
        services.AddSingleton<IConfiguration>(configuration);

        services.AddDbContext<ApplicationDbContext>(o => o.UseNpgsql(TestConnectionString));
        services.AddSingleton(backupService);

        return services.BuildServiceProvider();
    }

    /// <summary>
    /// A standalone ApplicationDbContext for assertions, independent of the DI
    /// container/scope used by the method under test — no scope-disposal bookkeeping
    /// needed, just `await using`.
    /// </summary>
    private ApplicationDbContext NewVerificationContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(TestConnectionString)
            .Options;
        return new ApplicationDbContext(options);
    }

    private static BackupSummary FakeSummary(string prefix) => new(
        FileName: $"{prefix}2026-01-01-000000.tar",
        SizeBytes: 1234,
        CreatedAtUtc: DateTime.UtcNow,
        Status: "ready",
        HostPath: "./data/backups/x.tar",
        ContainerPath: "/var/lib/modelibr/backups/x.tar",
        IncludesThumbnails: false,
        Error: null);

    [Fact]
    public async Task InitializeDatabaseAsync_PendingMigrations_BacksUpBeforeMigratingThenCleansUp()
    {
        var mockBackup = new Mock<IBackupService>();
        mockBackup
            .Setup(b => b.EstimateSizeAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BackupSizeEstimate(DatabaseBytes: 1024, UploadsBytes: 2048, ThumbnailsBytes: 0));
        mockBackup
            .Setup(b => b.CreateSnapshotAsync(
                It.Is<BackupScope>(s => s.IncludeThumbnails == false),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(FakeSummary(BackupNaming.PreMigrationSnapshotPrefix));

        await using var provider = BuildProvider(mockBackup.Object);

        await DatabaseExtensions.InitializeDatabaseAsync((IServiceProvider)provider);

        mockBackup.Verify(
            b => b.CreateSnapshotAsync(
                It.Is<BackupScope>(s => s.IncludeThumbnails == false),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()),
            Times.Once);
        mockBackup.Verify(
            b => b.CleanupSnapshots(BackupNaming.PreMigrationSnapshotPrefix, DatabaseExtensions.DefaultPreMigrationBackupRetention),
            Times.Once);

        await using var verify = NewVerificationContext();
        var pending = await verify.Database.GetPendingMigrationsAsync();
        Assert.Empty(pending); // migrations were actually applied
    }

    [Fact]
    public async Task InitializeDatabaseAsync_PreMigrationBackupFails_AbortsBeforeAnyMigrationIsApplied()
    {
        var mockBackup = new Mock<IBackupService>();
        mockBackup
            .Setup(b => b.EstimateSizeAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BackupSizeEstimate(0, 0, 0));
        mockBackup
            .Setup(b => b.CreateSnapshotAsync(It.IsAny<BackupScope>(), BackupNaming.PreMigrationSnapshotPrefix, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("pg_dump exited with code 1: simulated failure"));

        await using var provider = BuildProvider(mockBackup.Object);

        await using (var precheck = NewVerificationContext())
        {
            Assert.NotEmpty(await precheck.Database.GetPendingMigrationsAsync());
        }

        await Assert.ThrowsAsync<PreMigrationBackupFailedException>(
            () => DatabaseExtensions.InitializeDatabaseAsync((IServiceProvider)provider));

        mockBackup.Verify(
            b => b.CleanupSnapshots(It.IsAny<string>(), It.IsAny<int>()),
            Times.Never); // a failed backup must never trigger retention cleanup

        await using var verify = NewVerificationContext();
        var appliedAfterAbort = await verify.Database.GetAppliedMigrationsAsync();
        Assert.Empty(appliedAfterAbort); // MigrateAsync must never have run
    }

    [Fact]
    public async Task InitializeDatabaseAsync_SkipEnvVarSet_SkipsBackupButStillMigrates()
    {
        var mockBackup = new Mock<IBackupService>(MockBehavior.Strict);
        // Strict mock: ANY call to IBackupService fails the test — proves the skip
        // path never touches the backup service at all, not even EstimateSizeAsync.

        await using var provider = BuildProvider(mockBackup.Object, new Dictionary<string, string?>
        {
            [DatabaseExtensions.SkipEnvVar] = "true",
        });

        await DatabaseExtensions.InitializeDatabaseAsync((IServiceProvider)provider);

        await using var verify = NewVerificationContext();
        var pending = await verify.Database.GetPendingMigrationsAsync();
        Assert.Empty(pending); // migrations still applied despite the backup being skipped
    }

    [Fact]
    public async Task InitializeDatabaseAsync_NoPendingMigrations_NeverTouchesBackupService()
    {
        var mockBackup = new Mock<IBackupService>(MockBehavior.Strict);

        await using var provider = BuildProvider(mockBackup.Object);

        // Bring the schema fully up to date directly, bypassing the method under test,
        // so the second call below sees zero pending migrations.
        await using (var seed = NewVerificationContext())
        {
            await seed.Database.MigrateAsync();
        }

        // Ordinary boot with nothing pending must never resolve IBackupService — the
        // strict mock throws on any invocation if it does.
        await DatabaseExtensions.InitializeDatabaseAsync((IServiceProvider)provider);
    }
}
