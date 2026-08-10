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
            services.AddScoped<IChangeTrackerReset>(sp => sp.GetRequiredService<ApplicationDbContext>());

            services.AddScoped<IModelRepository, ModelRepository>();
            services.AddScoped<IModelVersionRepository, ModelVersionRepository>();
            services.AddScoped<IFileRepository, FileRepository>();
            services.AddScoped<IFilePersistence, FilePersistence>();
            services.AddScoped<IThumbnailRepository, ThumbnailRepository>();
            services.AddScoped<IThumbnailJobRepository, ThumbnailJobRepository>();
            services.AddScoped<IThumbnailJobEventRepository, ThumbnailJobEventRepository>();
            services.AddScoped<IAssetExtractionRepository, AssetExtractionRepository>();
            services.AddScoped<IExtractionJobRepository, ExtractionJobRepository>();
            services.AddScoped<IAssetPartRepository, AssetPartRepository>();
            services.AddScoped<IModelVersionAuxiliaryFileRepository, ModelVersionAuxiliaryFileRepository>();
            services.AddScoped<IAgentOperationLogRepository, AgentOperationLogRepository>();
            services.AddScoped<IAssetDerivationRepository, AssetDerivationRepository>();
            services.AddScoped<IAssetSearchDocumentRepository, AssetSearchDocumentRepository>();
            services.AddScoped<ISearchLogRepository, SearchLogRepository>();
            services.AddScoped<IComputeCacheRepository, ComputeCacheRepository>();
            services.AddScoped<Application.Extraction.Compute.ComputeCacheService>();

            // Derived-layer thresholds — config-driven guesses until prompt 26
            // calibrates them (bind the "Derivation" section, fall back to defaults).
            var derivationOptions =
                configuration.GetSection("Derivation").Get<Application.Extraction.Derivation.DerivationOptions>()
                ?? new Application.Extraction.Derivation.DerivationOptions();
            services.AddSingleton(derivationOptions);
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
            services.AddScoped<IStoreImportJobRepository, StoreImportJobRepository>();
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

            // Store importer (v0.5 prompt 05): SSRF-hardened client + in-process background queue.
            // storeUrl is user-supplied, so redirects are followed manually (see StoreImportClient);
            // auto-redirect is disabled at the handler level.
            var storeImportTimeoutSeconds = configuration.GetValue<int?>("STORE_IMPORT_HTTP_TIMEOUT_SECONDS") ?? 120;
            services.AddHttpClient(Infrastructure.Services.StoreImportClient.HttpClientName, client =>
                {
                    client.Timeout = TimeSpan.FromSeconds(storeImportTimeoutSeconds);
                })
                .ConfigurePrimaryHttpMessageHandler(Infrastructure.Services.StoreImportClient.CreatePrimaryHandler);

            services.AddScoped<Application.Abstractions.Services.IStoreImportClient, StoreImportClient>();

            // Registered once as a singleton, exposed through both the producer interface and
            // IHostedService so enqueue (request handlers) and consume (background loop) share
            // the same channel — mirrors the BlendFileGenerationQueue registration above.
            services.AddSingleton<StoreImportQueue>();
            services.AddSingleton<Application.Abstractions.Services.IStoreImportQueue>(sp => sp.GetRequiredService<StoreImportQueue>());
            services.AddHostedService(sp => sp.GetRequiredService<StoreImportQueue>());

            // Add WebDAV virtual asset store services
            services.AddVirtualAssetStore();

            return services;
        }
    }
}
