using Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Extensions;

public static class DatabaseExtensions
{
    public static async Task InitializeDatabaseAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<ApplicationDbContext>>();

        try
        {
            logger.LogInformation("Attempting database initialization...");

            // MigrateAsync creates the database if it doesn't exist yet and then
            // applies pending migrations. Do NOT gate this on CanConnectAsync:
            // that returns false when the database itself is missing (e.g. the
            // native installer's embedded server, where nothing pre-creates the
            // "Modelibr" database the way the Docker image's POSTGRES_DB does),
            // which would skip the very migration meant to create it.
            await context.Database.MigrateAsync();

            logger.LogInformation("Database initialization completed successfully");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Database initialization failed. Application will start without database connectivity.");
            // Don't throw - allow application to start even if database is not available
        }
    }
}