using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace WebApi.Tests.Integration;

[Trait("Category", "Integration")]
public sealed class StoreUrlMigrationIntegrationTests : IAsyncLifetime
{
    private const string Before = "20260824094621_DropLegacyWorldSpaceSurfaceAreaCache";
    private const string UnderTest = "20260825200000_AddStoreImportedItems";
    private const string Host = "localhost";
    private const int Port = 5432;
    private const string Username = "modelibr";
    private const string Password = "ChangeThisStrongPassword123!";

    private readonly string _database = $"Modelibr_StoreProvenanceMigrationTests_{Guid.NewGuid():N}";

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
    public async Task Upgrade_DropsSupersededIndex_NormalizesAndBackfillsLegacyProvenance()
    {
        await MigrateToAsync(Before);
        await ExecuteAsync("""
            CREATE UNIQUE INDEX "IX_AssetMetadata_StoreUrl_StoreAssetId_StoreItemId"
            ON "AssetMetadata" ("StoreUrl", "StoreAssetId", "StoreItemId")
            WHERE "StoreUrl" IS NOT NULL AND "StoreAssetId" IS NOT NULL AND "StoreItemId" IS NOT NULL;

            INSERT INTO "Models" ("Id", "Name", "CreatedAt", "UpdatedAt", "IsDeleted") VALUES
                (91001, 'Legacy model', now(), now(), false),
                (91002, 'Non-default port model', now(), now(), false),
                (91003, 'IPv6 model', now(), now(), false),
                (91004, 'Loopback model', now(), now(), false);

            INSERT INTO "AssetMetadata"
                ("Id", "AssetType", "AssetId", "SchemaVersion", "StoreUrl", "StoreAssetId",
                 "StoreItemId", "ImportedAt", "CreatedAt", "UpdatedAt")
            VALUES
                (92001, 'Model', 91001, 1, 'HTTPS://STORE.Example.COM/Packs/',
                 ' pack-1 ', ' item-1 ', now(), now(), now()),
                (92002, 'Model', 91002, 1, 'https://STORE.example.com:8443/Mixed/Path/',
                 'pack-2', 'item-2', now(), now(), now()),
                (92003, 'Model', 91003, 1, 'https://[2001:DB8::1]:443/Assets/',
                 'pack-3', 'item-3', now(), now(), now()),
                (92004, 'Model', 91004, 1, 'HTTP://LOCALHOST:80/Dev/',
                 'pack-4', 'item-4', now(), now(), now());
            """);

        await MigrateToAsync(UnderTest);

        Assert.Equal(0, await ScalarAsync<long>("""
            SELECT count(*) FROM pg_indexes
            WHERE indexname = 'IX_AssetMetadata_StoreUrl_StoreAssetId_StoreItemId';
            """));
        Assert.Equal(1, await ScalarAsync<long>("""
            SELECT count(*) FROM "StoreImportedItems"
            WHERE "StoreUrl" = 'https://store.example.com/Packs'
              AND "StoreAssetId" = 'pack-1'
              AND "StoreItemId" = 'item-1'
              AND "AssetType" = 'Model'
              AND "AssetId" = 91001;
            """));
        Assert.Equal(1, await ScalarAsync<long>("""
            SELECT count(*) FROM "StoreImportedItems"
            WHERE "StoreUrl" = 'https://store.example.com:8443/Mixed/Path'
              AND "StoreAssetId" = 'pack-2' AND "StoreItemId" = 'item-2';
            """));
        Assert.Equal(1, await ScalarAsync<long>("""
            SELECT count(*) FROM "StoreImportedItems"
            WHERE "StoreUrl" = 'https://[2001:db8::1]/Assets'
              AND "StoreAssetId" = 'pack-3' AND "StoreItemId" = 'item-3';
            """));
        Assert.Equal(1, await ScalarAsync<long>("""
            SELECT count(*) FROM "StoreImportedItems"
            WHERE "StoreUrl" = 'http://localhost/Dev'
              AND "StoreAssetId" = 'pack-4' AND "StoreItemId" = 'item-4';
            """));
    }

    [Fact]
    public async Task Upgrade_RejectsWhitespaceNormalizedCollision_InsteadOfDroppingOneProvenanceRow()
    {
        await MigrateToAsync(Before);
        await ExecuteAsync("""
            INSERT INTO "Models" ("Id", "Name", "CreatedAt", "UpdatedAt", "IsDeleted") VALUES
                (91011, 'Legacy model A', now(), now(), false),
                (91012, 'Legacy model B', now(), now(), false);

            INSERT INTO "AssetMetadata"
                ("Id", "AssetType", "AssetId", "SchemaVersion", "StoreUrl", "StoreAssetId",
                 "StoreItemId", "ImportedAt", "CreatedAt", "UpdatedAt") VALUES
                (92011, 'Model', 91011, 1, 'https://store.example.com', 'pack-1', 'item-1', now(), now(), now()),
                (92012, 'Model', 91012, 1, 'HTTPS://STORE.EXAMPLE.COM/', ' pack-1 ', ' item-1 ', now(), now(), now());
            """);

        var error = await Assert.ThrowsAsync<PostgresException>(() => MigrateToAsync(UnderTest));

        Assert.Contains("equivalent canonical store items", error.MessageText);
    }

    [Theory]
    [InlineData("https://user:secret@store.example.com")]
    [InlineData("https://store.example.com?channel=preview")]
    [InlineData("https://store.example.com#preview")]
    [InlineData("ftp://store.example.com")]
    public async Task Upgrade_RejectsLegacyUrls_ThatRuntimeImportsCannotAddress(string storeUrl)
    {
        await MigrateToAsync(Before);
        await ExecuteAsync($"""
            INSERT INTO "Models" ("Id", "Name", "CreatedAt", "UpdatedAt", "IsDeleted")
            VALUES (91021, 'Legacy model', now(), now(), false);

            INSERT INTO "AssetMetadata"
                ("Id", "AssetType", "AssetId", "SchemaVersion", "StoreUrl", "StoreAssetId",
                 "StoreItemId", "ImportedAt", "CreatedAt", "UpdatedAt")
            VALUES
                (92021, 'Model', 91021, 1, '{storeUrl.Replace("'", "''")}',
                 'pack-1', 'item-1', now(), now(), now());
            """);

        var error = await Assert.ThrowsAsync<PostgresException>(() => MigrateToAsync(UnderTest));

        Assert.Contains("unsupported scheme, query, fragment, or credentials", error.MessageText);
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
