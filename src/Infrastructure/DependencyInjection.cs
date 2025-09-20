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
                if (connectionString?.Contains("Data Source=") == true)
                {
                    // SQLite connection
                    optionsBuilder.UseSqlite(connectionString);
                }
                else
                {
                    // SQL Server connection
                    optionsBuilder.UseSqlServer(connectionString);
                }
            });

            services.AddScoped<IModelRepository, ModelRepository>();

            return services;
        }
    }
}
