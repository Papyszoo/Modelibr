using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Every test class that uses ModelibrWebFactory must carry
/// [Collection(Name)] (keeping its own IClassFixture&lt;ModelibrWebFactory&gt;
/// as usual — this is NOT a shared-instance collection fixture). Each factory
/// instance drops and recreates the SAME shared "Modelibr_IntegrationTests"
/// database in its constructor — xUnit runs different test classes in
/// parallel by default, so two classes' factory constructors racing to
/// drop/create that one database at the same time fail unpredictably. Putting
/// them in one named collection makes xUnit run the classes sequentially
/// instead (each still gets its own factory/database lifecycle).
/// </summary>
[CollectionDefinition(Name)]
public class PostgresIntegrationCollection
{
    public const string Name = "Postgres Integration";
}

/// <summary>
/// WebApplicationFactory that connects to localhost PostgreSQL using an isolated
/// test database (Modelibr_IntegrationTests). Never touches the dev database.
/// The database is created automatically and dropped on dispose.
/// </summary>
public class ModelibrWebFactory : WebApplicationFactory<Program>
{
    private readonly string _uploadPath;

    private const string Host = "localhost";
    private const int Port = 5432;
    private const string Username = "modelibr";
    private const string Password = "ChangeThisStrongPassword123!";
    private const string TestDatabase = "Modelibr_IntegrationTests";

    private static readonly string AdminConnectionString =
        $"Host={Host};Port={Port};Database=postgres;Username={Username};Password={Password};";

    private static readonly string TestConnectionString =
        $"Host={Host};Port={Port};Database={TestDatabase};Username={Username};Password={Password};";

    public ModelibrWebFactory()
    {
        _uploadPath = Path.Combine(Path.GetTempPath(), "modelibr_concurrency_tests", Path.GetRandomFileName());
        Directory.CreateDirectory(_uploadPath);

        // RestoreOnBootProcessor runs in Program.Main right after CreateBuilder —
        // BEFORE the factory's deferred ConfigureAppConfiguration is applied — so
        // at that point it can only see environment variables. Without these it
        // falls back to /var/lib/modelibr/* and dies on a dev machine.
        Environment.SetEnvironmentVariable("RESTORE_STORAGE_PATH", Path.Combine(_uploadPath, "restore"));
        Environment.SetEnvironmentVariable("THUMBNAIL_STORAGE_PATH", Path.Combine(_uploadPath, "thumbnails"));

        // The freshly-created test database has every migration pending, which would
        // trigger DatabaseExtensions' automatic pre-migration backup (and, on backup
        // failure, abort startup) on every single test using this factory. That backup
        // shells out to `pg_dump`, which isn't guaranteed to be on PATH on a dev machine
        // or CI runner — so it's skipped by default here. Tests that specifically cover
        // the pre-migration-backup gate build their own minimal host instead of this
        // factory (see Infrastructure.Tests/Extensions/DatabaseExtensionsTests.cs).
        Environment.SetEnvironmentVariable("MODELIBR_SKIP_PREMIGRATION_BACKUP", "true");

        EnsureTestDatabaseCreated();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = TestConnectionString,
                ["UPLOAD_STORAGE_PATH"] = _uploadPath,
                // RestoreOnBootProcessor defaults these to /var/lib/modelibr/*,
                // which isn't writable when the host boots on a dev machine.
                ["RESTORE_STORAGE_PATH"] = Path.Combine(_uploadPath, "restore"),
                ["THUMBNAIL_STORAGE_PATH"] = Path.Combine(_uploadPath, "thumbnails"),
                ["BACKUP_STORAGE_PATH"] = Path.Combine(_uploadPath, "backups"),
                ["HTTPS_PORT"] = "0",
                ["EXPOSE_443_PORT"] = "false",
                ["DisableHttpsRedirection"] = "true",
            });
        });

        builder.ConfigureServices(services =>
        {
            // Remove Kestrel HTTPS configuration — TestServer doesn't use Kestrel
            services.Configure<Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServerOptions>(opts => { });
        });
    }

    private static void EnsureTestDatabaseCreated()
    {
        using var conn = new NpgsqlConnection(AdminConnectionString);
        conn.Open();

        // Drop and recreate for a clean slate each test run
        using var dropCmd = conn.CreateCommand();
        dropCmd.CommandText = $"""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '{TestDatabase}' AND pid <> pg_backend_pid();
            """;
        dropCmd.ExecuteNonQuery();

        using var drop2 = conn.CreateCommand();
        drop2.CommandText = $"DROP DATABASE IF EXISTS \"{TestDatabase}\";";
        drop2.ExecuteNonQuery();

        using var createCmd = conn.CreateCommand();
        createCmd.CommandText = $"CREATE DATABASE \"{TestDatabase}\";";
        createCmd.ExecuteNonQuery();
    }

    private static void DropTestDatabase()
    {
        try
        {
            using var conn = new NpgsqlConnection(AdminConnectionString);
            conn.Open();

            using var terminateCmd = conn.CreateCommand();
            terminateCmd.CommandText = $"""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '{TestDatabase}' AND pid <> pg_backend_pid();
                """;
            terminateCmd.ExecuteNonQuery();

            using var dropCmd = conn.CreateCommand();
            dropCmd.CommandText = $"DROP DATABASE IF EXISTS \"{TestDatabase}\";";
            dropCmd.ExecuteNonQuery();
        }
        catch
        {
            // Best-effort cleanup — CI or dev machine may not have PostgreSQL running
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            if (Directory.Exists(_uploadPath))
            {
                try { Directory.Delete(_uploadPath, true); }
                catch { /* best-effort cleanup */ }
            }

            DropTestDatabase();
        }

        base.Dispose(disposing);
    }
}
