using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Infrastructure.Tests.Migrations;

/// <summary>
/// <c>EnforceRootCategoryUniqueness</c> run as an <b>upgrade</b>, over a database that
/// already holds the duplicates it exists to merge.
///
/// <para>
/// The merge is a PL/pgSQL block, so nothing in the C# test suite or the model snapshot
/// can say whether it works - only running it can, and only against data shaped like the
/// libraries it will meet. This migrates to the revision before it, seeds that data
/// through raw SQL (the entity model no longer permits duplicate roots, which is the
/// point), and then migrates the rest of the way.
/// </para>
///
/// <para>
/// The case that failed: children whose names already fill <c>Name</c>'s 100 characters.
/// Moving them under the winning root suffixes any collision, and the suffix used to be
/// appended past the column's limit - so an upgrade that was supposed to preserve a branch
/// died with a value-too-long error partway through, leaving the merge half-applied.
/// </para>
///
/// <para>
/// Needs a real PostgreSQL (migrations are relational-only, and the whole subject here is
/// a partial expression index and a DO block). Own database per test instance, for the
/// reasons <c>DatabaseExtensionsTests</c> spells out.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
public sealed class RootCategoryUniquenessMigrationTests : IAsyncLifetime
{
    /// <summary>The revision immediately before the one under test.</summary>
    private const string Before = "20260824093518_AddAgentClaimGenerationAndReversalLease";

    private const string UnderTest = "20260824093530_EnforceRootCategoryUniqueness";

    private const string Host = "localhost";
    private const int Port = 5432;
    private const string Username = "modelibr";
    private const string Password = "ChangeThisStrongPassword123!";

    private readonly string _database = $"Modelibr_RootCategoryMigrationTests_{Guid.NewGuid():N}";

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

    private async Task<List<string>> NamesAsync(string sql)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var command = conn.CreateCommand();
        command.CommandText = sql;
        await using var reader = await command.ExecuteReaderAsync();
        var names = new List<string>();
        while (await reader.ReadAsync())
        {
            names.Add(reader.GetString(0));
        }

        return names;
    }

    /// <summary>A name of exactly <paramref name="length"/> characters, ending distinctively.</summary>
    private static string LongName(int length, string tail) =>
        new string('x', length - tail.Length) + tail;

    [Fact]
    public async Task The_Upgrade_Merges_Duplicate_Roots_Without_Losing_Categories_Or_References()
    {
        await MigrateToAsync(Before);

        // Two roots called "Vehicles" - the split an unguarded parallel import produced -
        // plus a third differing only in case, which the new index also folds together.
        // Their children include names already at the 100-character limit, the case the
        // suffixing used to break on.
        var collidingName = LongName(100, "-COLLIDES");
        await ExecuteAsync($"""
            INSERT INTO "ModelCategories" ("Id", "Name", "ParentId", "CreatedAt", "UpdatedAt") VALUES
                (1001, 'Vehicles', NULL, now(), now()),
                (1002, 'Vehicles', NULL, now(), now()),
                (1003, 'vehicles', NULL, now(), now()),
                -- The winner already owns this exact name, so every incoming twin collides.
                (1010, '{collidingName}', 1001, now(), now()),
                (1011, '{collidingName}', 1002, now(), now()),
                (1012, '{collidingName}', 1003, now(), now()),
                -- A short name, to show the ordinary path still reads as before.
                (1020, 'Trucks', 1001, now(), now()),
                (1021, 'Trucks', 1002, now(), now());

            INSERT INTO "Models" ("Id", "Name", "CreatedAt", "UpdatedAt", "IsDeleted", "ModelCategoryId")
            VALUES (2001, 'a model', now(), now(), false, 1002),
                   (2002, 'another model', now(), now(), false, 1003);

            INSERT INTO "AssetMetadata"
                ("Id", "AssetType", "AssetId", "SchemaVersion", "AutoCategoryId", "CreatedAt", "UpdatedAt")
            VALUES (3001, 'Model', 2001, 1, 1002, now(), now());

            INSERT INTO "AssetSearchDocuments"
                ("Id", "AssetType", "AssetId", "CategoryId", "IsCurrentVersion", "Prominence",
                 "DisplayName", "Tokens", "Symbols", "BrowseSummary", "UpdatedAt")
            VALUES (4001, 'Model', 2001, 1002, true, 'Normal', 'a model', '', '', '', now());
            """);

        // The upgrade itself.
        await MigrateToAsync(UnderTest);

        // One root survives, and it is the lowest id - deterministic, so a support answer
        // about which row won is the same on every machine.
        var roots = await NamesAsync("""
            SELECT "Name" FROM "ModelCategories" WHERE "ParentId" IS NULL ORDER BY "Id";
            """);
        Assert.Equal(["Vehicles"], roots);
        Assert.Equal(1001, await ScalarAsync<int>("""
            SELECT "Id" FROM "ModelCategories" WHERE "ParentId" IS NULL;
            """));

        // Not one child was lost - five of them, all now under the winner.
        Assert.Equal(5, await ScalarAsync<long>("""
            SELECT count(*) FROM "ModelCategories" WHERE "ParentId" = 1001;
            """));

        // Every generated name is legal, which is the fix. Before it, this migration threw.
        var overlong = await ScalarAsync<long>("""
            SELECT count(*) FROM "ModelCategories" WHERE length("Name") > 100;
            """);
        Assert.Equal(0, overlong);

        // Multiple collisions on one name resolve to successive suffixes, in id order, and
        // every one of them still fits the column.
        var maxedOut = await NamesAsync("""
            SELECT "Name" FROM "ModelCategories"
            WHERE "ParentId" = 1001 AND "Name" LIKE 'x%' ORDER BY "Id";
            """);
        Assert.Equal(3, maxedOut.Count);
        Assert.Equal(collidingName, maxedOut[0]);
        Assert.EndsWith(" (2)", maxedOut[1]);
        Assert.EndsWith(" (3)", maxedOut[2]);
        Assert.Equal(maxedOut.Count, maxedOut.Distinct().Count());
        Assert.All(maxedOut, name => Assert.Equal(100, name.Length));

        // The short-named twin took the ordinary path.
        Assert.Contains("Trucks (2)", await NamesAsync("""
            SELECT "Name" FROM "ModelCategories" WHERE "ParentId" = 1001;
            """));

        // Every reference moved to the winner - the FK, and both raw scalar columns no FK
        // declares, which nothing but this migration would have touched.
        Assert.Equal(2, await ScalarAsync<long>("""
            SELECT count(*) FROM "Models" WHERE "ModelCategoryId" = 1001;
            """));
        Assert.Equal(1001, await ScalarAsync<int>("""
            SELECT "AutoCategoryId" FROM "AssetMetadata" WHERE "Id" = 3001;
            """));
        Assert.Equal(1001, await ScalarAsync<int>("""
            SELECT "CategoryId" FROM "AssetSearchDocuments" WHERE "AssetId" = 2001;
            """));
    }

    [Fact]
    public async Task The_Upgrade_Keeps_Texture_Set_Roots_Of_Different_Kinds_Apart()
    {
        // Global Materials (Universal) and Multi-Model Textures (ModelSpecific) are separate
        // asset types sharing one table. A "Stone" root in each is two categories, not a
        // duplicate, and merging them would silently join two vocabularies the app keeps
        // apart on purpose.
        await MigrateToAsync(Before);

        await ExecuteAsync("""
            INSERT INTO "TextureSetCategories" ("Id", "Name", "ParentId", "Kind", "CreatedAt", "UpdatedAt") VALUES
                (1101, 'Stone', NULL, 0, now(), now()),
                (1102, 'Stone', NULL, 1, now(), now()),
                (1103, 'Stone', NULL, 1, now(), now());
            """);

        await MigrateToAsync(UnderTest);

        // The genuine duplicate within one kind is merged; the cross-kind pair is untouched.
        Assert.Equal(2, await ScalarAsync<long>("""
            SELECT count(*) FROM "TextureSetCategories" WHERE "ParentId" IS NULL;
            """));
        Assert.Equal(1, await ScalarAsync<long>("""
            SELECT count(*) FROM "TextureSetCategories" WHERE "ParentId" IS NULL AND "Kind" = 0;
            """));
        Assert.Equal(1, await ScalarAsync<long>("""
            SELECT count(*) FROM "TextureSetCategories" WHERE "ParentId" IS NULL AND "Kind" = 1;
            """));
    }

    [Fact]
    public async Task The_Upgraded_Database_Refuses_A_Second_Root_Of_The_Same_Name()
    {
        // What the merge was clearing the way for. Case-insensitive at the root, matching
        // what the import automation already means by "the same category".
        await MigrateToAsync(UnderTest);

        await ExecuteAsync("""
            INSERT INTO "ModelCategories" ("Id", "Name", "ParentId", "CreatedAt", "UpdatedAt")
            VALUES (1201, 'Vehicles', NULL, now(), now());
            """);

        var duplicate = await Assert.ThrowsAsync<PostgresException>(() => ExecuteAsync("""
            INSERT INTO "ModelCategories" ("Id", "Name", "ParentId", "CreatedAt", "UpdatedAt")
            VALUES (1202, 'VEHICLES', NULL, now(), now());
            """));

        Assert.Equal(PostgresErrorCodes.UniqueViolation, duplicate.SqlState);
    }

    [Fact]
    public async Task The_Whole_Migration_Chain_Still_Runs_On_An_Empty_Database()
    {
        // The ordinary upgrade, with nothing to merge - the path every clean install takes.
        await using var context = NewContext();
        await context.Database.MigrateAsync();

        Assert.Empty(await context.Database.GetPendingMigrationsAsync());
    }
}
