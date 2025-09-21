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
                if (string.IsNullOrEmpty(connectionString))
                {
                    // Use in-memory database for demo purposes when SQL Server is not available
                    optionsBuilder.UseInMemoryDatabase("ModelibrDemo");
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
    }
}
