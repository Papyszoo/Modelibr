using Application.Abstractions.Repositories;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Infrastructure
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            services.AddDbContext<ApplicationDbContext>(optionsBuilder =>
            {
                var connectionString = configuration.GetConnectionString("Default");
                
                // Check if connection string contains unresolved environment variables or is invalid
                if (string.IsNullOrEmpty(connectionString) || 
                    connectionString.Contains("${") || 
                    connectionString.Contains("localhost") && !IsValidSqlServerConnection(connectionString))
                {
                    // Use in-memory database for testing when no valid connection string is provided
                    optionsBuilder.UseInMemoryDatabase("ModelibrTestDb");
                }
                else
                {
                    optionsBuilder.UseSqlServer(connectionString);
                }
            });

            services.AddScoped<IModelRepository, ModelRepository>();
            services.AddScoped<IFileRepository, FileRepository>();

            return services;
        }

        private static bool IsValidSqlServerConnection(string connectionString)
        {
            // Simple check for unresolved environment variables
            return !connectionString.Contains("${") && !connectionString.Contains("}");
        }
    }
}
