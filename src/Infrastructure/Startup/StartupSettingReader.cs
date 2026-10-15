using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Infrastructure.Startup;

/// <summary>
/// Reads settings straight from the <c>Settings</c> table before the DI
/// container exists. The MCP toggles are needed at builder time because tool
/// registration is startup-static, so there is no scoped repository to ask.
///
/// Deliberately tolerant: a fresh database has no Settings table yet, and an
/// unreachable database is not this reader's failure to report - the caller
/// falls back to env/defaults either way. Any failure returns no values.
/// </summary>
public static class StartupSettingReader
{
    public static IReadOnlyDictionary<string, string> ReadSettings(
        IConfiguration configuration,
        ILogger logger,
        IReadOnlyCollection<string> keys)
    {
        var keyList = keys.Distinct(StringComparer.Ordinal).ToArray();
        if (keyList.Length == 0)
        {
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }

        try
        {
            var connectionString = ResolveConnectionString(configuration);
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                return new Dictionary<string, string>(StringComparer.Ordinal);
            }

            // Short timeout: this runs on every boot, and a database that is not
            // up yet must not stall startup - migrations report that failure.
            var builder = new NpgsqlConnectionStringBuilder(connectionString) { Timeout = 5 };
            using var connection = new NpgsqlConnection(builder.ConnectionString);
            connection.Open();

            using var command = new NpgsqlCommand(
                "SELECT \"Key\", \"Value\" FROM \"Settings\" WHERE \"Key\" = ANY(@keys)",
                connection);
            command.Parameters.AddWithValue("keys", keyList);

            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                result[reader.GetString(0)] = reader.GetString(1);
            }

            return result;
        }
        catch (Exception ex)
        {
            logger.LogDebug(
                ex,
                "Startup settings are not readable yet (missing table or unreachable database); " +
                "falling back to environment/defaults.");
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }
    }

    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default");
        if (!string.IsNullOrWhiteSpace(connectionString))
        {
            return Environment.ExpandEnvironmentVariables(connectionString);
        }

        var host = configuration["POSTGRES_HOST"] ?? "postgres";
        var port = int.TryParse(configuration["POSTGRES_PORT"], out var parsedPort) ? parsedPort : 5432;
        var database = configuration["POSTGRES_DB"] ?? "Modelibr";
        var user = configuration["POSTGRES_USER"] ?? "modelibr";
        var password = configuration["POSTGRES_PASSWORD"] ?? string.Empty;

        return new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = port,
            Database = database,
            Username = user,
            Password = password,
        }.ConnectionString;
    }
}
