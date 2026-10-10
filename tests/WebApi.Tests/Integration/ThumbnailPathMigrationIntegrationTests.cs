using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The thumbnail/preview path migration must convert every absolute path to the
/// uploads-relative form, whatever the uploads root was, and must leave an
/// already-relative (or non-addressable) value alone. Running it twice must not
/// change anything - it is idempotent by construction.
/// </summary>
[Trait("Category", "Integration")]
public sealed class ThumbnailPathMigrationIntegrationTests : IAsyncLifetime
{
    private const string Before = "20261009155921_AddMaterialEffects";
    private const string UnderTest = "20261009225136_ThumbnailPathsRelativeUploadsRoot";
    private const string Host = "localhost";
    private const int Port = 5432;
    private const string Username = "modelibr";
    private const string Password = "ChangeThisStrongPassword123!";

    private static readonly string Tail = $"{new string('a', 2)}/{new string('b', 2)}/{new string('c', 64)}";

    // A historical Windows row: Path.Combine produced backslashes between the
    // content-addressed tail's segments.
    private static readonly string WindowsTail = $"{new string('a', 2)}\\{new string('b', 2)}\\{new string('c', 64)}";

    private readonly string _database = $"Modelibr_ThumbnailPathMigrationTests_{Guid.NewGuid():N}";

    private static readonly string AdminConnectionString =
        $"Host={Host};Port={Port};Database=postgres;Username={Username};Password={Password};";

    private string ConnectionString =>
        $"Host={Host};Port={Port};Database={_database};Username={Username};Password={Password};";

    public async Task InitializeAsync()
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var create = connection.CreateCommand();
        create.CommandText = $"CREATE DATABASE \"{_database}\";";
        await create.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        try
        {
            NpgsqlConnection.ClearPool(new NpgsqlConnection(ConnectionString));
            await using var connection = new NpgsqlConnection(AdminConnectionString);
            await connection.OpenAsync();

            await using var terminate = connection.CreateCommand();
            terminate.CommandText = $"""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '{_database}' AND pid <> pg_backend_pid();
                """;
            await terminate.ExecuteNonQueryAsync();

            await using var drop = connection.CreateCommand();
            drop.CommandText = $"DROP DATABASE IF EXISTS \"{_database}\";";
            await drop.ExecuteNonQueryAsync();
        }
        catch
        {
            // Best-effort cleanup must not mask the test failure.
        }
    }

    [Fact]
    public async Task Upgrade_NormalizesAbsolutePathsToUploadsRelative_WhateverTheRoot()
    {
        await MigrateToAsync(Before);
        await ExecuteAsync($$"""
            INSERT INTO "Vfx" ("Id", "Name", "DefinitionJson", "CreatedAt", "UpdatedAt", "ThumbnailPath") VALUES
                (91001, 'docker', '{}'::jsonb, now(), now(), '/var/lib/modelibr/uploads/{{Tail}}'),
                (91002, 'native', '{}'::jsonb, now(), now(), '/home/me/modelibr/data/uploads/{{Tail}}'),
                (91003, 'already-relative', '{}'::jsonb, now(), now(), '{{Tail}}'),
                (91004, 'not-addressed', '{}'::jsonb, now(), now(), '/somewhere/legacy.png'),
                (91005, 'null-path', '{}'::jsonb, now(), now(), NULL),
                (91006, 'windows', '{}'::jsonb, now(), now(), 'C:\uploads\{{WindowsTail}}'),
                (91007, 'windows-forward', '{}'::jsonb, now(), now(), 'C:/uploads/{{Tail}}');
            """);

        await MigrateToAsync(UnderTest);

        Assert.Equal(Tail, await ScalarAsync<string>($"""SELECT "ThumbnailPath" FROM "Vfx" WHERE "Id" = 91001;"""));
        Assert.Equal(Tail, await ScalarAsync<string>($"""SELECT "ThumbnailPath" FROM "Vfx" WHERE "Id" = 91002;"""));
        Assert.Equal(Tail, await ScalarAsync<string>($"""SELECT "ThumbnailPath" FROM "Vfx" WHERE "Id" = 91003;"""));
        Assert.Equal(
            "/somewhere/legacy.png",
            await ScalarAsync<string>($"""SELECT "ThumbnailPath" FROM "Vfx" WHERE "Id" = 91004;"""));
        Assert.Equal(
            0L,
            await ScalarAsync<long>($"""SELECT count(*) FROM "Vfx" WHERE "Id" = 91005 AND "ThumbnailPath" IS NOT NULL;"""));
        // A Windows row normalises to the same forward-slash relative form.
        Assert.Equal(Tail, await ScalarAsync<string>($"""SELECT "ThumbnailPath" FROM "Vfx" WHERE "Id" = 91006;"""));
        Assert.Equal(Tail, await ScalarAsync<string>($"""SELECT "ThumbnailPath" FROM "Vfx" WHERE "Id" = 91007;"""));
    }

    [Fact]
    public async Task Normalizer_IsIdempotent_RunningItAgainChangesNothing()
    {
        await MigrateToAsync(UnderTest);
        await ExecuteAsync($$"""
            INSERT INTO "Vfx" ("Id", "Name", "DefinitionJson", "CreatedAt", "UpdatedAt", "ThumbnailPath") VALUES
                (91011, 'absolute', '{}'::jsonb, now(), now(), '/var/lib/modelibr/uploads/{{Tail}}'),
                (91012, 'relative', '{}'::jsonb, now(), now(), '{{Tail}}');
            """);

        // Run the exact statements the migration runs, twice, against seeded rows.
        await ExecuteStatementsAsync();
        var afterFirst = await AllVfxPathsAsync();
        await ExecuteStatementsAsync();
        var afterSecond = await AllVfxPathsAsync();

        Assert.Equal(Tail, afterFirst[91011]);
        Assert.Equal(Tail, afterFirst[91012]);
        Assert.Equal(afterFirst, afterSecond);
    }

    private async Task ExecuteStatementsAsync()
    {
        foreach (var statement in ThumbnailPathNormalizer.Statements())
        {
            await ExecuteAsync(statement);
        }
    }

    private async Task<Dictionary<int, string?>> AllVfxPathsAsync()
    {
        var result = new Dictionary<int, string?>();
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """SELECT "Id", "ThumbnailPath" FROM "Vfx" ORDER BY "Id";""";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result[reader.GetInt32(0)] = reader.IsDBNull(1) ? null : reader.GetString(1);
        }
        return result;
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

    private async Task ExecuteAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }

    private async Task<T> ScalarAsync<T>(string sql)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        var value = await command.ExecuteScalarAsync();
        return (T)Convert.ChangeType(value!, typeof(T))!;
    }
}
