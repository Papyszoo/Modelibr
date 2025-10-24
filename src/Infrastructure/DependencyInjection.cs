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
                
                optionsBuilder.UseNpgsql(connectionString);
            });

            services.AddScoped<IModelRepository, ModelRepository>();
            services.AddScoped<IModelVersionRepository, ModelVersionRepository>();
            services.AddScoped<IFileRepository, FileRepository>();
            services.AddScoped<IFilePersistence, FilePersistence>();
            services.AddScoped<IThumbnailRepository, ThumbnailRepository>();
            services.AddScoped<IThumbnailJobRepository, ThumbnailJobRepository>();
            services.AddScoped<IThumbnailJobEventRepository, ThumbnailJobEventRepository>();
            services.AddScoped<ITextureSetRepository, TextureSetRepository>();
            services.AddScoped<IPackRepository, PackRepository>();
            services.AddScoped<IProjectRepository, ProjectRepository>();
            services.AddScoped<IStageRepository, StageRepository>();
            services.AddScoped<IApplicationSettingsRepository, ApplicationSettingsRepository>();
            services.AddScoped<ISettingRepository, SettingRepository>();
            services.AddScoped<IBatchUploadRepository, BatchUploadRepository>();
            services.AddScoped<IThumbnailQueue, ThumbnailQueue>();
            services.AddScoped<IDomainEventDispatcher, DomainEventDispatcher>();

            return services;
        }
    }
}
