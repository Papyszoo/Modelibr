using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Infrastructure.Services;
using Infrastructure.WebDav;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Infrastructure
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            // Scoped, not Singleton: DomainEventsInterceptor keeps per-save
            // recursion-guard state that must not leak across requests.
            services.AddScoped<DomainEventsInterceptor>();

            services.AddDbContext<ApplicationDbContext>((sp, optionsBuilder) =>
            {
                var connectionString = configuration.GetConnectionString("Default");
                if (string.IsNullOrEmpty(connectionString))
                {
                    throw new InvalidOperationException("Database connection string 'Default' is not configured.");
                }

                // Expand environment variables in connection string
                connectionString = Environment.ExpandEnvironmentVariables(connectionString);

                optionsBuilder
                    .UseNpgsql(connectionString)
                    .AddInterceptors(sp.GetRequiredService<DomainEventsInterceptor>());
            });

            services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<ApplicationDbContext>());

            services.AddScoped<IModelRepository, ModelRepository>();
            services.AddScoped<IModelVersionRepository, ModelVersionRepository>();
            services.AddScoped<IFileRepository, FileRepository>();
            services.AddScoped<IFilePersistence, FilePersistence>();
            services.AddScoped<IThumbnailRepository, ThumbnailRepository>();
            services.AddScoped<IThumbnailJobRepository, ThumbnailJobRepository>();
            services.AddScoped<IThumbnailJobEventRepository, ThumbnailJobEventRepository>();
            services.AddScoped<ITextureSetRepository, TextureSetRepository>();
            services.AddScoped<ITextureProxyRepository, TextureProxyRepository>();
            services.AddScoped<IPackRepository, PackRepository>();
            services.AddScoped<IProjectRepository, ProjectRepository>();
            services.AddScoped<IModelCategoryRepository, ModelCategoryRepository>();
            services.AddScoped<IModelTagRepository, ModelTagRepository>();
            services.AddScoped<IStageRepository, StageRepository>();
            services.AddScoped<IApplicationSettingsRepository, ApplicationSettingsRepository>();
            services.AddScoped<ISettingRepository, SettingRepository>();
            services.AddScoped<IBatchUploadRepository, BatchUploadRepository>();
            services.AddScoped<ISpriteRepository, SpriteRepository>();
            services.AddScoped<ISpriteCategoryRepository, SpriteCategoryRepository>();
            services.AddScoped<ISoundRepository, SoundRepository>();
            services.AddScoped<ISoundCategoryRepository, SoundCategoryRepository>();
            services.AddScoped<IScriptRepository, ScriptRepository>();
            services.AddScoped<IScriptCategoryRepository, ScriptCategoryRepository>();
            services.AddScoped<IScriptTemplateRepository, ScriptTemplateRepository>();
            services.AddScoped<IEnvironmentMapRepository, EnvironmentMapRepository>();
            services.AddScoped<IEnvironmentMapCategoryRepository, EnvironmentMapCategoryRepository>();
            services.AddScoped<ITextureSetCategoryRepository, TextureSetCategoryRepository>();
            services.AddScoped<ISearchRepository, SearchRepository>();
            services.AddScoped<IEnvironmentMapSizeLabelService, EnvironmentMapSizeLabelService>();
            services.AddScoped<ITextureImageMetadataReader, TextureImageMetadataReader>();
            services.AddScoped<IThumbnailQueue, ThumbnailQueue>();
            services.AddScoped<IDomainEventDispatcher, DomainEventDispatcher>();

            // Add audio selection service for trimmed audio snippets
            services.AddSingleton<IAudioSelectionService, AudioSelectionService>();

            // Backup / restore service
            services.AddSingleton<IBackupService, BackupService>();

            // Add Blender installation management service
            services.AddSingleton<IBlenderInstallationService, BlenderInstallationService>();
            services.AddSingleton<IBlendFileGenerator, BlendFileGenerator>();

            // Background generation queue for generated-{name}.blend (see IBlendFileGenerationQueue).
            // Registered once as a singleton and exposed through both the Application-facing
            // producer interface and IHostedService so the enqueue side (request handlers)
            // and the consumer (BackgroundService.ExecuteAsync) share the same channel.
            services.AddSingleton<BlendFileGenerationQueue>();
            services.AddSingleton<IBlendFileGenerationQueue>(sp => sp.GetRequiredService<BlendFileGenerationQueue>());
            services.AddHostedService(sp => sp.GetRequiredService<BlendFileGenerationQueue>());
            services.AddHttpClient("BlenderDownload", client =>
            {
                client.Timeout = TimeSpan.FromMinutes(30);
            });

            services.AddHttpClient("WebDavProbe", client =>
            {
                client.Timeout = TimeSpan.FromSeconds(5);
            });

            // Add WebDAV virtual asset store services
            services.AddVirtualAssetStore();

            return services;
        }
    }
}
