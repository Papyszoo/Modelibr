using Application.Abstractions.Services;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Extensions;

/// <summary>
/// Thrown when the automatic pre-migration backup fails. Left uncaught by
/// <see cref="DatabaseExtensions.InitializeDatabaseAsync(WebApplication)"/> on purpose —
/// it propagates out of <c>Program.Main</c> and aborts startup, because applying a
/// pending migration with no safety net is worse than not starting at all.
/// </summary>
public sealed class PreMigrationBackupFailedException : Exception
{
    public PreMigrationBackupFailedException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

public static class DatabaseExtensions
{
    /// <summary>Env var that opts out of the automatic pre-migration backup (not recommended).</summary>
    public const string SkipEnvVar = "MODELIBR_SKIP_PREMIGRATION_BACKUP";

    /// <summary>Env var overriding how many pre-migration snapshots are retained.</summary>
    public const string RetentionEnvVar = "MODELIBR_PREMIGRATION_BACKUP_RETENTION";

    public const int DefaultPreMigrationBackupRetention = 3;

    public static Task InitializeDatabaseAsync(this WebApplication app) =>
        InitializeDatabaseAsync(app.Services);

    /// <summary>
    /// Core implementation, decoupled from <see cref="WebApplication"/> so it can be
    /// exercised against a bare <see cref="IServiceProvider"/> in tests without spinning
    /// up Kestrel/hosting — see Infrastructure.Tests/Extensions/DatabaseExtensionsTests.cs.
    /// </summary>
    internal static async Task InitializeDatabaseAsync(IServiceProvider rootServices)
    {
        using var scope = rootServices.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<ApplicationDbContext>>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();

        List<string> pendingMigrations;
        try
        {
            logger.LogInformation("Attempting database initialization...");

            // Checked separately from MigrateAsync (below) so a pending migration can
            // trigger a pre-migration backup first. Do NOT gate this on CanConnectAsync:
            // that returns false when the database itself is missing (e.g. the native
            // installer's embedded server, where nothing pre-creates the "Modelibr"
            // database the way the Docker image's POSTGRES_DB does), which would skip
            // the very migration meant to create it.
            pendingMigrations = (await context.Database.GetPendingMigrationsAsync()).ToList();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Database initialization failed. Application will start without database connectivity.");
            return;
        }

        if (pendingMigrations.Count > 0)
        {
            logger.LogInformation(
                "{Count} pending migration(s) detected: {Migrations}",
                pendingMigrations.Count,
                string.Join(", ", pendingMigrations));

            // Intentionally NOT inside the try/catch below — a failure here must
            // propagate out of InitializeDatabaseAsync and abort startup (unless the
            // operator explicitly opted out), never be swallowed like a connectivity
            // failure.
            await TakePreMigrationBackupAsync(scope.ServiceProvider, logger, configuration);
        }

        try
        {
            await context.Database.MigrateAsync();

            logger.LogInformation("Database initialization completed successfully");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Database initialization failed. Application will start without database connectivity.");
            // Don't throw - allow application to start even if database is not available
        }
    }

    private static async Task TakePreMigrationBackupAsync(
        IServiceProvider services,
        ILogger logger,
        IConfiguration configuration)
    {
        if (configuration.GetValue<bool>(SkipEnvVar))
        {
            logger.LogWarning(
                "{EnvVar}=true — skipping the automatic pre-migration backup. If the " +
                "upcoming migration fails or is destructive there is no automatic rollback " +
                "point. This is not recommended outside throwaway environments.",
                SkipEnvVar);
            return;
        }

        var backupService = services.GetRequiredService<IBackupService>();

        try
        {
            // Logged upfront so a large library doesn't look like a hang — this backup
            // runs before the app serves any traffic.
            var estimate = await backupService.EstimateSizeAsync(CancellationToken.None);
            logger.LogInformation(
                "Taking automatic pre-migration backup before applying migrations " +
                "(estimated database ~{DbMb:N1} MB, uploads ~{UploadsMb:N1} MB; thumbnails " +
                "excluded — they regenerate). The app has not started serving traffic yet; " +
                "this may take a while for a large library.",
                estimate.DatabaseBytes / 1024d / 1024d,
                estimate.UploadsBytes / 1024d / 1024d);

            var summary = await backupService.CreateSnapshotAsync(
                new BackupScope(IncludeThumbnails: false),
                BackupNaming.PreMigrationSnapshotPrefix,
                CancellationToken.None);

            logger.LogInformation(
                "Pre-migration backup completed: {FileName} ({SizeBytes:N0} bytes).",
                summary.FileName,
                summary.SizeBytes);

            var retention = configuration.GetValue<int?>(RetentionEnvVar) ?? DefaultPreMigrationBackupRetention;
            backupService.CleanupSnapshots(BackupNaming.PreMigrationSnapshotPrefix, retention);
        }
        catch (Exception ex)
        {
            logger.LogCritical(
                ex,
                "Pre-migration backup failed — aborting startup before applying pending " +
                "migrations so a schema change is never made without a safety net. Set " +
                "{EnvVar}=true to bypass this check (not recommended).",
                SkipEnvVar);
            throw new PreMigrationBackupFailedException(
                "Automatic pre-migration backup failed; aborting startup before applying pending migrations.",
                ex);
        }
    }
}
