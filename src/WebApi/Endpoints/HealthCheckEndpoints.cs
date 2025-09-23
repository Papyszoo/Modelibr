using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace WebApi.Endpoints;

public static class HealthCheckEndpoints
{
    public static void MapHealthCheckEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", async (ApplicationDbContext dbContext) =>
        {
            var healthResponse = new
            {
                Status = "Healthy",
                Database = "Unknown",
                FileCount = (int?)null,
                ModelCount = (int?)null,
                Timestamp = DateTime.UtcNow
            };

            try
            {
                // Test database connectivity by executing a simple query
                var canConnect = await dbContext.Database.CanConnectAsync();
                if (!canConnect)
                {
                    // Application is healthy even if database is not available
                    return Results.Ok(new
                    {
                        Status = "Healthy",
                        Database = "Disconnected",
                        FileCount = (int?)null,
                        ModelCount = (int?)null,
                        Timestamp = DateTime.UtcNow
                    });
                }

                // Test a simple query to ensure database is accessible
                var fileCount = await dbContext.Files.CountAsync();
                var modelCount = await dbContext.Models.CountAsync();

                return Results.Ok(new
                {
                    Status = "Healthy",
                    Database = "Connected",
                    FileCount = fileCount,
                    ModelCount = modelCount,
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                // Application is healthy even if database query fails
                return Results.Ok(new
                {
                    Status = "Healthy",
                    Database = $"Error: {ex.Message}",
                    FileCount = (int?)null,
                    ModelCount = (int?)null,
                    Timestamp = DateTime.UtcNow
                });
            }
        })
        .WithName("Health Check")
        .WithOpenApi();
    }
}