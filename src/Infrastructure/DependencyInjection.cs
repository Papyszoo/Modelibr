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
                
                // If connection string uses placeholders, build it from configuration
                if (!string.IsNullOrEmpty(connectionString) && connectionString.Contains("${"))
                {
                    var server = configuration["Database:Server"] ?? "localhost";
                    var port = configuration["Database:Port"] ?? configuration["MSSQL_PORT"] ?? "1433";
                    var database = configuration["Database:Name"] ?? "Modelibr";
                    var userId = configuration["Database:UserId"] ?? "sa";
                    var password = configuration["Database:Password"] ?? configuration["SA_PASSWORD"] ?? "ChangeThisStrongPassword123!";
                    
                    connectionString = $"Server={server},{port};Database={database};User Id={userId};Password={password};TrustServerCertificate=true;";
                }
                
                if (string.IsNullOrEmpty(connectionString))
                {
                    throw new InvalidOperationException("Database connection string 'Default' is not configured.");
                }
                
                optionsBuilder.UseSqlServer(connectionString);
            });

            services.AddScoped<IModelRepository, ModelRepository>();
            services.AddScoped<IFileRepository, FileRepository>();

            return services;
        }
    }
}
