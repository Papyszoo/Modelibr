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
            
            // Test basic connectivity first
            var canConnect = await context.Database.CanConnectAsync();
            if (!canConnect)
            {
                logger.LogWarning("Database is not available. Application will start without database connectivity.");
                return;
            }
            
            // Apply pending migrations to ensure database is up to date
            await context.Database.MigrateAsync();
            
            // Seed default environment if none exists
            await SeedDefaultEnvironmentAsync(context, logger);
            
            logger.LogInformation("Database initialization completed successfully");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Database initialization failed. Application will start without database connectivity.");
            // Don't throw - allow application to start even if database is not available
        }
    }

    private static async Task SeedDefaultEnvironmentAsync(ApplicationDbContext context, ILogger logger)
    {
        try
        {
            // Check if any environments exist
            var hasEnvironments = await context.Environments.AnyAsync();
            if (!hasEnvironments)
            {
                logger.LogInformation("No environments found. Creating default 'Stage' environment...");
                
                var defaultEnvironment = Domain.Models.Environment.CreateDefaultStage(DateTime.UtcNow);
                context.Environments.Add(defaultEnvironment);
                await context.SaveChangesAsync();
                
                logger.LogInformation("Default 'Stage' environment created successfully");
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to seed default environment. This is not critical.");
        }
    }
}