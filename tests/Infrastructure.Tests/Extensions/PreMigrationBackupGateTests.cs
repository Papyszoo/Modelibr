using Application.Abstractions.Services;
using Infrastructure.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Extensions;

/// <summary>
/// Covers the pre-migration backup gate in isolation from the database: whether a
/// backup is attempted, skipped, or fatal.
///
/// The distinction that matters is between a backup that RUNS and fails (a real loss
/// of the safety net - must abort startup) and tooling that was never shipped (a
/// packaging gap - must not leave the app unable to start). A packaged desktop build
/// carries a trimmed embedded PostgreSQL whose bin/ holds only initdb, pg_ctl and
/// postgres, so the second case is the normal one on desktop.
///
/// Deliberately database-free: the migration path itself is covered by the
/// [Category=Integration] DatabaseExtensionsTests, which needs a live PostgreSQL.
/// This suite is the one that runs in the ordinary CI lane, which is exactly where a
/// regression in this decision would otherwise hide.
/// </summary>
public sealed class PreMigrationBackupGateTests
{
    private static ServiceProvider BuildProvider(
        IBackupService backupService,
        Dictionary<string, string?>? extraConfig = null)
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddProvider(NullLoggerProvider.Instance));
        services.AddSingleton<IConfiguration>(
            new ConfigurationBuilder()
                .AddInMemoryCollection(extraConfig ?? new Dictionary<string, string?>())
                .Build());
        services.AddSingleton(backupService);
        return services.BuildServiceProvider();
    }

    private static BackupSummary FakeSnapshot() => new(
        FileName: $"{BackupNaming.PreMigrationSnapshotPrefix}2026-01-01-000000.tar",
        SizeBytes: 1234,
        CreatedAtUtc: DateTime.UtcNow,
        Status: "ready",
        HostPath: "./data/backups/x.tar",
        ContainerPath: "/var/lib/modelibr/backups/x.tar",
        IncludesThumbnails: false,
        Error: null);

    private static Mock<IBackupService> BackupWithTooling(bool available)
    {
        var mock = new Mock<IBackupService>();
        mock.Setup(b => b.GetToolAvailability()).Returns(
            available
                ? new BackupToolAvailability(true, null)
                : new BackupToolAvailability(false, "'/runtime/postgres/bin/pg_dump' is configured but does not exist."));
        mock
            .Setup(b => b.EstimateSizeAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BackupSizeEstimate(0, 0, 0));
        mock
            .Setup(b => b.CreateSnapshotAsync(
                It.IsAny<BackupScope>(),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(FakeSnapshot());
        return mock;
    }

    [Fact]
    public async Task ToolingNotShipped_SkipsSnapshotWithoutThrowing()
    {
        var mock = BackupWithTooling(available: false);
        await using var provider = BuildProvider(mock.Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CreateSnapshotAsync(
                It.IsAny<BackupScope>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
        mock.Verify(
            b => b.CleanupSnapshots(It.IsAny<string>(), It.IsAny<int>()),
            Times.Never);
    }

    [Fact]
    public async Task ToolingAvailable_TakesSnapshotAndAppliesRetention()
    {
        var mock = BackupWithTooling(available: true);
        await using var provider = BuildProvider(mock.Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CreateSnapshotAsync(
                It.Is<BackupScope>(s => s.IncludeThumbnails == false),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()),
            Times.Once);
        mock.Verify(
            b => b.CleanupSnapshots(
                BackupNaming.PreMigrationSnapshotPrefix,
                DatabaseExtensions.DefaultPreMigrationBackupRetention),
            Times.Once);
    }

    [Fact]
    public async Task ToolingAvailableButSnapshotFails_StillAborts()
    {
        // The skip in the first test must not weaken this one: a backup that actually
        // ran and failed means the safety net is gone, so startup must stop.
        var mock = BackupWithTooling(available: true);
        mock
            .Setup(b => b.CreateSnapshotAsync(
                It.IsAny<BackupScope>(),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("pg_dump exited with code 1"));

        await using var provider = BuildProvider(mock.Object);

        await Assert.ThrowsAsync<PreMigrationBackupFailedException>(() =>
            DatabaseExtensions.TakePreMigrationBackupAsync(
                provider,
                NullLogger.Instance,
                provider.GetRequiredService<IConfiguration>()));

        mock.Verify(
            b => b.CleanupSnapshots(It.IsAny<string>(), It.IsAny<int>()),
            Times.Never);
    }

    [Fact]
    public async Task SkipEnvVarSet_NeverConsultsToolingOrTakesSnapshot()
    {
        var mock = new Mock<IBackupService>(MockBehavior.Strict);
        await using var provider = BuildProvider(
            mock.Object,
            new Dictionary<string, string?> { [DatabaseExtensions.SkipEnvVar] = "true" });

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(b => b.GetToolAvailability(), Times.Never);
    }
}
