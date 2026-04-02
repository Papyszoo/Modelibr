using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace WebApi.Tests.Integration;

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
