using Application.Settings;
using Domain.Services;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Infrastructure.Tests.Migrations;

/// <summary>
/// <c>SettingsKeyValueOnly</c> run as an <b>upgrade</b> over a database that
/// still holds the legacy singleton <c>ApplicationSettings</c> row: the row's
/// values are written into the key-value <c>Settings</c> table and the table is
/// dropped.
///
/// <para>
/// The assertions read the migrated database through
/// <see cref="GetSettingsQueryHandler"/> - the query behind <c>GET /settings</c> -
/// so they prove what the settings API returns after the upgrade, not just what
/// the raw rows hold. Verification of the current readers shows they prefer the
/// ApplicationSettings row for the seven core keys whenever it exists, so the
/// row's value is the one written where the stores disagree; a differing
/// key-value entry can only be a migration seed or an unused per-key write, and
/// letting it win would silently change a user's setting on upgrade. Extended
/// settings live only in the key-value table and are never touched, and the
/// never-read recycled-files column must not become an active purge.
/// </para>
///
/// <para>
/// Needs a real PostgreSQL: the subject is a data-copy (and a table drop) inside
/// a migration, which only runs on a relational provider. One database per test
/// instance, for the reasons <c>RootCategoryUniquenessMigrationTests</c> spells out.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
public sealed class SettingsKeyValueMigrationTests : IAsyncLifetime
{
    /// <summary>The revision immediately before the one under test.</summary>
    private const string Before = "20261013074727_RemoveStagesFeature";

    private const string UnderTest = "20261013074743_SettingsKeyValueOnly";

    private const string Host = "localhost";
    private const int Port = 5432;
    private const string Username = "modelibr";
    private const string Password = "ChangeThisStrongPassword123!";

    private readonly string _database = $"Modelibr_SettingsMigrationTests_{Guid.NewGuid():N}";

    private static readonly string AdminConnectionString =
        $"Host={Host};Port={Port};Database=postgres;Username={Username};Password={Password};";

    private string ConnectionString =>
        $"Host={Host};Port={Port};Database={_database};Username={Username};Password={Password};";

    public async Task InitializeAsync()
    {
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();
        await using var create = conn.CreateCommand();
        create.CommandText = $"CREATE DATABASE \"{_database}\";";
        await create.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        try
        {
            NpgsqlConnection.ClearPool(new NpgsqlConnection(ConnectionString));

            await using var conn = new NpgsqlConnection(AdminConnectionString);
            await conn.OpenAsync();

            await using var terminate = conn.CreateCommand();
            terminate.CommandText = $"""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '{_database}' AND pid <> pg_backend_pid();
                """;
            await terminate.ExecuteNonQueryAsync();

            await using var drop = conn.CreateCommand();
            drop.CommandText = $"DROP DATABASE IF EXISTS \"{_database}\";";
            await drop.ExecuteNonQueryAsync();
        }
        catch
        {
            // Best-effort cleanup - never fail teardown on top of the real failure.
        }
    }

    private ApplicationDbContext NewContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        return new ApplicationDbContext(options);
    }

    private async Task MigrateToAsync(string target)
    {
        await using var context = NewContext();
        var migrator = context.GetInfrastructure().GetRequiredService<IMigrator>();
        await migrator.MigrateAsync(target);
    }

    private async Task<T> ScalarAsync<T>(string sql)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var command = conn.CreateCommand();
        command.CommandText = sql;
        var value = await command.ExecuteScalarAsync();
        return (T)Convert.ChangeType(value!, typeof(T))!;
    }

    private async Task ExecuteAsync(string sql)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var command = conn.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>What <c>GET /settings</c> returns against the migrated database.</summary>
    private async Task<GetSettingsQueryResponse> ReadSettingsThroughApiAsync()
    {
        await using var context = NewContext();
        var handler = new GetSettingsQueryHandler(
            new SettingRepository(context),
            SettingEnvironmentDefaults.None,
            new FixedDateTimeProvider(new DateTime(2026, 3, 3, 3, 3, 3, DateTimeKind.Utc)));

        var result = await handler.Handle(new GetSettingsQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        return result.Value;
    }

    private sealed class FixedDateTimeProvider(DateTime utcNow) : IDateTimeProvider
    {
        public DateTime UtcNow { get; } = utcNow;
    }

    [Fact]
    public async Task The_Upgrade_Reads_Back_Every_Stored_Setting_After_The_Row_Is_Gone()
    {
        await MigrateToAsync(Before);

        // Non-default values in every column the old row carried, plus key-value
        // rows for the settings that always lived there. CleanRecycledFilesAfterDays
        // disagrees between the two stores on purpose: the column was never read,
        // the key-value row is the user's choice, and the choice must survive.
        await ExecuteAsync("""
            INSERT INTO "ApplicationSettings"
                ("Id", "MaxFileSizeBytes", "MaxThumbnailSizeBytes", "ThumbnailFrameCount", "ThumbnailSize",
                 "GenerateThumbnailOnUpload", "GenerateAnimatedThumbnail", "CleanRecycledFilesAfterDays",
                 "TextureProxySize", "CreatedAt", "UpdatedAt")
            VALUES
                (1, 2147483648, 5242880, 12, 512, false, false, 30, 1024,
                 '2026-01-01 12:00:00+00', '2026-02-02 12:30:00+00');

            INSERT INTO "Settings" ("Key", "Value", "Description", "CreatedAt", "UpdatedAt") VALUES
                ('BlenderPath', '/opt/blender/blender', NULL, now(), now()),
                ('BlenderEnabled', 'true', NULL, now(), now()),
                ('DuplicateNamePolicy', 'Reject', NULL, now(), now()),
                ('AutoAssignOnImport', 'false', NULL, now(), now()),
                ('CleanRecycledFilesAfterDays', '14', NULL, now(), now()),
                ('SkipDuplicateThumbnails', 'true', NULL, now(), now()),
                ('ThumbnailBackground', '#112233', NULL, now(), now());
            """);

        await MigrateToAsync(UnderTest);

        var settings = await ReadSettingsThroughApiAsync();

        var expected = new GetSettingsQueryResponse(
            MaxFileSizeBytes: 2_147_483_648,
            MaxThumbnailSizeBytes: 5_242_880,
            ThumbnailFrameCount: 12,
            ThumbnailSize: 512,
            GenerateThumbnailOnUpload: false,
            GenerateAnimatedThumbnail: false,
            TextureProxySize: 1024,
            BlenderPath: "/opt/blender/blender",
            BlenderEnabled: true,
            DuplicateNamePolicy: "Reject",
            AutoAssignOnImport: false,
            CleanRecycledFilesAfterDays: 14,
            PreMigrationBackupEnabled: true,
            PreMigrationBackupRetention: 3,
            SkipDuplicateThumbnails: true,
            McpEnabled: true,
            McpWriteEnabled: false,
            McpDestructiveEnabled: false,
            ThumbnailBackground: "#112233",
            BlenderOperationTimeoutMinutes: 15,
            CreatedAt: new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc),
            UpdatedAt: new DateTime(2026, 2, 2, 12, 30, 0, DateTimeKind.Utc));

        Assert.Equal(expected, settings);

        // The legacy table is gone; the values live in Settings only.
        Assert.Equal(0, await ScalarAsync<long>("""
            SELECT count(*) FROM information_schema.tables WHERE table_name = 'ApplicationSettings';
            """));
    }

    [Fact]
    public async Task The_Upgrade_Keeps_The_Row_Value_Where_The_Two_Stores_Disagree()
    {
        await MigrateToAsync(Before);

        // The stores only ever disagreed because of migration seeds (the
        // CollapseThumbnailWidthHeightToSize ThumbnailSize of 256) or direct
        // per-key API writes - and in every case the current readers preferred
        // the row, so its value is what users saw. It must be the one that
        // survives, or a dormant install's thumbnail size would silently drop
        // from 512 to the seed's 256 during the upgrade.
        await ExecuteAsync("""
            INSERT INTO "ApplicationSettings"
                ("Id", "MaxFileSizeBytes", "MaxThumbnailSizeBytes", "ThumbnailFrameCount", "ThumbnailSize",
                 "GenerateThumbnailOnUpload", "GenerateAnimatedThumbnail", "CleanRecycledFilesAfterDays",
                 "TextureProxySize", "CreatedAt", "UpdatedAt")
            VALUES
                (1, 111111, 10485760, 30, 512, true, true, 0, 1024,
                 '2026-01-01 12:00:00+00', '2026-01-01 12:00:00+00');

            INSERT INTO "Settings" ("Key", "Value", "Description", "CreatedAt", "UpdatedAt") VALUES
                ('MaxFileSizeBytes', '222222', NULL, '2026-02-01 09:00:00+00', '2026-02-01 09:00:00+00');
            """);

        await MigrateToAsync(UnderTest);

        var settings = await ReadSettingsThroughApiAsync();

        Assert.Equal(111111, settings.MaxFileSizeBytes);
        Assert.Equal(512, settings.ThumbnailSize);

        // One row per key, holding the value the readers actually returned.
        Assert.Equal(1, await ScalarAsync<long>("""
            SELECT count(*) FROM "Settings" WHERE "Key" = 'MaxFileSizeBytes' AND "Value" = '111111';
            """));
        Assert.Equal(0, await ScalarAsync<long>("""
            SELECT count(*) FROM "Settings" WHERE "Key" = 'MaxFileSizeBytes' AND "Value" = '222222';
            """));
    }

    [Fact]
    public async Task The_Upgrade_Does_Not_Turn_The_Never_Purge_Into_An_Active_Purge()
    {
        await MigrateToAsync(Before);

        // An upgraded install whose row still carries the old 30-day default but
        // whose owner never chose a retention: no key-value entry exists. The old
        // reader ignored the column entirely, so the upgrade must too; copying it
        // would start deleting recycled items days after the update.
        await ExecuteAsync("""
            INSERT INTO "ApplicationSettings"
                ("Id", "MaxFileSizeBytes", "MaxThumbnailSizeBytes", "ThumbnailFrameCount", "ThumbnailSize",
                 "GenerateThumbnailOnUpload", "GenerateAnimatedThumbnail", "CleanRecycledFilesAfterDays",
                 "TextureProxySize", "CreatedAt", "UpdatedAt")
            VALUES
                (1, 1073741824, 10485760, 30, 256, true, true, 30, 512,
                 '2026-01-01 12:00:00+00', '2026-01-01 12:00:00+00');
            """);

        await MigrateToAsync(UnderTest);

        var settings = await ReadSettingsThroughApiAsync();

        Assert.Equal(0, settings.CleanRecycledFilesAfterDays);
        Assert.Equal(0, await ScalarAsync<long>("""
            SELECT count(*) FROM "Settings" WHERE "Key" = 'CleanRecycledFilesAfterDays';
            """));
    }
}
