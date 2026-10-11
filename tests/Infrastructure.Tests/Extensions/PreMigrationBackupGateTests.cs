using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Settings;
using Domain.Models;
using Infrastructure.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Extensions;

/// <summary>
/// Covers the pre-migration backup in isolation from the database: whether a
/// snapshot is taken, skipped, or fatal.
///
/// The decision this file pins down is that a backup that RUNS and fails aborts
/// startup. That has no second case next to it any more: the dump is written
/// through the same driver the app already uses to reach PostgreSQL, so there is
/// no external tool that can be missing, and no "the packaging never shipped it"
/// path to confuse a lost safety net with a deliberate skip.
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
        Dictionary<string, string?>? extraConfig = null,
        ISettingRepository? settingRepository = null)
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddProvider(NullLoggerProvider.Instance));
        services.AddSingleton<IConfiguration>(
            new ConfigurationBuilder()
                .AddInMemoryCollection(extraConfig ?? new Dictionary<string, string?>())
                .Build());
        services.AddSingleton(backupService);
        if (settingRepository is not null)
        {
            services.AddSingleton(settingRepository);
        }
        return services.BuildServiceProvider();
    }

    private static Mock<ISettingRepository> StoredBackupSettings(string? enabled, string? retention)
    {
        var mock = new Mock<ISettingRepository>();
        mock.Setup(r => r.GetByKeyAsync(SettingKeys.PreMigrationBackupEnabled, It.IsAny<CancellationToken>()))
            .ReturnsAsync(enabled is null ? null : Setting.Create(SettingKeys.PreMigrationBackupEnabled, enabled, DateTime.UtcNow));
        mock.Setup(r => r.GetByKeyAsync(SettingKeys.PreMigrationBackupRetention, It.IsAny<CancellationToken>()))
            .ReturnsAsync(retention is null ? null : Setting.Create(SettingKeys.PreMigrationBackupRetention, retention, DateTime.UtcNow));
        return mock;
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

    private static Mock<IBackupService> WorkingBackup()
    {
        var mock = new Mock<IBackupService>();
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
    public async Task TakesSnapshotAndAppliesRetention()
    {
        var mock = WorkingBackup();
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
    public async Task SnapshotFails_AbortsStartup()
    {
        // The whole point of the pre-migration backup is that it is there when the
        // migration goes wrong. A backup that ran and failed means the safety net is
        // gone, so startup stops rather than applying a destructive migration with
        // nothing to go back to.
        var mock = WorkingBackup();
        mock
            .Setup(b => b.CreateSnapshotAsync(
                It.IsAny<BackupScope>(),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("the managed dump could not be written"));

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
    public async Task SkipEnvVarSet_TakesNoSnapshot()
    {
        // Strict behaviour: the opt-out must not reach the backup service at all, so
        // this fails if a future change consults anything before the env check.
        var mock = new Mock<IBackupService>(MockBehavior.Strict);
        await using var provider = BuildProvider(
            mock.Object,
            new Dictionary<string, string?> { [DatabaseExtensions.SkipEnvVar] = "true" });

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
    }

    [Fact]
    public async Task StoredSettingDisabled_NoEnv_TakesNoSnapshot()
    {
        var mock = new Mock<IBackupService>(MockBehavior.Strict);
        await using var provider = BuildProvider(mock.Object, settingRepository: StoredBackupSettings("false", null).Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CreateSnapshotAsync(It.IsAny<BackupScope>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task StoredSettingDisabled_EnvExplicitlyEnabled_EnvWins()
    {
        // Docker forwards MODELIBR_SKIP_PREMIGRATION_BACKUP=false explicitly; that
        // operator statement must beat a stored opt-out.
        var mock = WorkingBackup();
        await using var provider = BuildProvider(
            mock.Object,
            new Dictionary<string, string?> { [DatabaseExtensions.SkipEnvVar] = "false" },
            StoredBackupSettings("false", null).Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CreateSnapshotAsync(
                It.IsAny<BackupScope>(),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task EnvSkipTrue_BeatsStoredEnabled()
    {
        var mock = new Mock<IBackupService>(MockBehavior.Strict);
        await using var provider = BuildProvider(
            mock.Object,
            new Dictionary<string, string?> { [DatabaseExtensions.SkipEnvVar] = "true" },
            StoredBackupSettings("true", null).Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CreateSnapshotAsync(It.IsAny<BackupScope>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task StoredRetention_UsedWhenEnvAbsent()
    {
        var mock = WorkingBackup();
        await using var provider = BuildProvider(mock.Object, settingRepository: StoredBackupSettings(null, "7").Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CleanupSnapshots(BackupNaming.PreMigrationSnapshotPrefix, 7),
            Times.Once);
    }

    [Fact]
    public async Task EnvRetention_BeatsStoredRetention()
    {
        var mock = WorkingBackup();
        await using var provider = BuildProvider(
            mock.Object,
            new Dictionary<string, string?> { [DatabaseExtensions.RetentionEnvVar] = "5" },
            StoredBackupSettings(null, "7").Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CleanupSnapshots(BackupNaming.PreMigrationSnapshotPrefix, 5),
            Times.Once);
    }

    [Fact]
    public async Task UnreadableStoredSettings_FallBackToDefaults()
    {
        // The Settings table does not exist yet on a fresh database; the decision
        // must fall back to env/defaults instead of failing.
        var mock = WorkingBackup();
        var unreadable = new Mock<ISettingRepository>();
        unreadable
            .Setup(r => r.GetByKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("relation \"Settings\" does not exist"));
        await using var provider = BuildProvider(mock.Object, settingRepository: unreadable.Object);

        await DatabaseExtensions.TakePreMigrationBackupAsync(
            provider,
            NullLogger.Instance,
            provider.GetRequiredService<IConfiguration>());

        mock.Verify(
            b => b.CreateSnapshotAsync(
                It.IsAny<BackupScope>(),
                BackupNaming.PreMigrationSnapshotPrefix,
                It.IsAny<CancellationToken>()),
            Times.Once);
        mock.Verify(
            b => b.CleanupSnapshots(
                BackupNaming.PreMigrationSnapshotPrefix,
                DatabaseExtensions.DefaultPreMigrationBackupRetention),
            Times.Once);
    }
}
