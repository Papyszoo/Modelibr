using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace WebApi.Endpoints;

public static class HealthCheckEndpoints
{
    public static void MapHealthCheckEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", async (ApplicationDbContext dbContext) =>
        {
            try
            {
                // Test database connectivity by executing a simple query
                var canConnect = await dbContext.Database.CanConnectAsync();
                if (!canConnect)
                {
                    return Results.Problem("Database connection failed", statusCode: 503);
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
                return Results.Problem($"Health check failed: {ex.Message}", statusCode: 503);
            }
        })
        .WithName("Health Check")
        .WithOpenApi();
    }
}