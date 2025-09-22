using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Infrastructure.Services;
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
                if (string.IsNullOrEmpty(connectionString))
                {
                    throw new InvalidOperationException("Database connection string 'Default' is not configured.");
                }
                
                // Expand environment variables in connection string
                connectionString = Environment.ExpandEnvironmentVariables(connectionString);
                
                optionsBuilder.UseSqlServer(connectionString);
            });

            services.AddScoped<IModelRepository, ModelRepository>();
            services.AddScoped<IFileRepository, FileRepository>();
            services.AddScoped<IThumbnailJobRepository, ThumbnailJobRepository>();
            services.AddScoped<IThumbnailQueue, ThumbnailQueue>();

            return services;
        }
    }
}
