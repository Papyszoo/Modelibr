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
using Microsoft.Extensions.Logging;

namespace Infrastructure
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            // Side effects that must wait for the commit - see IPostCommitActions. Registered
            // as the concrete type as well, because PostCommitUnitOfWork needs the drain and
            // SaveDurabilityInterceptor needs the claim; the interface deliberately exposes
            // neither. It has to come before the interceptors - the durability one takes it.
            services.AddScoped<PostCommitActions>();
            services.AddScoped<IPostCommitActions>(sp => sp.GetRequiredService<PostCommitActions>());

            // Scoped, not Singleton: DomainEventsInterceptor keeps per-save
            // recursion-guard state that must not leak across requests, and
            // SaveDurabilityInterceptor's counters describe one scope's writes.
            // Built by hand rather than by reflection because its constructor is internal -
            // it takes the queue whose ownership boundary it moves.
            services.AddScoped(sp => new DomainEventsInterceptor(
                sp.GetRequiredService<IDomainEventDispatcher>(),
                sp.GetRequiredService<PostCommitActions>(),
                sp.GetRequiredService<ILogger<DomainEventsInterceptor>>()));
            services.AddScoped(sp => new SaveDurabilityInterceptor(sp.GetRequiredService<PostCommitActions>()));

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
                    // ORDER IS LOAD-BEARING, for two reasons that both point the same way.
                    // EF runs the SavedChangesAsync interceptors in registration order and
                    // stops at the first one that throws, so the durability signal has to be
                    // taken before anything that can throw takes it away. And that signal is
                    // also where the post-commit queue changes hands, so it has to happen
                    // before anything that can re-enter the unit of work - which is exactly
                    // what DomainEventsInterceptor does from there, dispatching events to
                    // handlers that save. See SaveDurabilityInterceptor.
                    .AddInterceptors(
                        sp.GetRequiredService<SaveDurabilityInterceptor>(),
                        sp.GetRequiredService<DomainEventsInterceptor>());
            });

            // The context is still the thing that commits; the decorator is what decides when
            // the queued after-commit effects are allowed to happen.
            services.AddScoped<IUnitOfWork>(sp => new PostCommitUnitOfWork(
                sp.GetRequiredService<ApplicationDbContext>(),
                sp.GetRequiredService<PostCommitActions>(),
                sp.GetRequiredService<SaveDurabilityInterceptor>()));
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
            services.AddScoped<IAgentUploadTicketRepository, AgentUploadTicketRepository>();
            services.AddScoped<Application.Abstractions.Services.IAgentUploadTickets, Services.AgentUploadTickets>();
            services.AddScoped<Application.Abstractions.Services.ISceneDocumentCommit, Services.SceneDocumentCommit>();
            services.AddScoped<IAssetDerivationRepository, AssetDerivationRepository>();
            services.AddScoped<IAssetSearchDocumentRepository, AssetSearchDocumentRepository>();
            services.AddScoped<IAssetMetadataRepository, AssetMetadataRepository>();
            services.AddScoped<IProjectProfileOptionRepository, ProjectProfileOptionRepository>();
            services.AddScoped<ISearchLogRepository, SearchLogRepository>();
            services.AddScoped<IComputeCacheRepository, ComputeCacheRepository>();
            services.AddScoped<Application.Extraction.Compute.ComputeCacheService>();

            // Derived-layer thresholds - config-driven guesses until prompt 26
            // calibrates them (bind the "Derivation" section, fall back to defaults).
            var derivationOptions =
                configuration.GetSection("Derivation").Get<Application.Extraction.Derivation.DerivationOptions>()
                ?? new Application.Extraction.Derivation.DerivationOptions();
            services.AddSingleton(derivationOptions);
            services.AddScoped<ITextureSetRepository, TextureSetRepository>();
            services.AddScoped<IMaterialRepository, MaterialRepository>();
            services.AddScoped<ITextureProxyRepository, TextureProxyRepository>();
            services.AddScoped<IPackRepository, PackRepository>();
            services.AddScoped<IProjectRepository, ProjectRepository>();
            services.AddScoped<IModelCategoryRepository, ModelCategoryRepository>();
            services.AddScoped<IModelTagRepository, ModelTagRepository>();
            services.AddScoped<IStageRepository, StageRepository>();
            services.AddScoped<ISceneRepository, SceneRepository>();
            services.AddScoped<ISceneAssetUsageRepository, SceneAssetUsageRepository>();
            services.AddScoped<ISceneRenderRepository, SceneRenderRepository>();
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
            services.AddScoped<IStoreImportedItemRepository, StoreImportedItemRepository>();
            services.AddScoped<Application.Abstractions.Services.IStoreImportLockService, Services.StoreImportLockService>();
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

            // Store catalog reader (v0.6 prompt 15): anonymous, small JSON, short timeout.
            // Deliberately NOT the importer's client - that one is sized for multi-gigabyte
            // file transfer, and a catalog query behind a two-minute timeout would let an
            // unreachable store stall an agent's search instead of answering it.
            var storeCatalogTimeoutSeconds = configuration.GetValue<int?>("STORE_CATALOG_HTTP_TIMEOUT_SECONDS") ?? 10;
            services.AddHttpClient(Infrastructure.Services.StoreCatalogClient.HttpClientName, client =>
                {
                    client.Timeout = TimeSpan.FromSeconds(storeCatalogTimeoutSeconds);
                })
                // The importer's handler exactly: manual redirects so every hop is
                // re-validated, and a ConnectCallback that dials the address which passed
                // that validation. A default handler would follow redirects itself AND
                // resolve the host itself, undoing both halves at once.
                .ConfigurePrimaryHttpMessageHandler(
                    Infrastructure.Services.StoreCatalogClient.CreatePrimaryHandler);

            services.AddScoped<Application.Abstractions.Services.IStoreCatalogClient, StoreCatalogClient>();

            // Registered once as a singleton, exposed through both the producer interface and
            // IHostedService so enqueue (request handlers) and consume (background loop) share
            // the same channel - mirrors the BlendFileGenerationQueue registration above.
            services.AddSingleton<StoreImportQueue>();
            services.AddSingleton<Application.Abstractions.Services.IStoreImportQueue>(sp => sp.GetRequiredService<StoreImportQueue>());
            services.AddHostedService(sp => sp.GetRequiredService<StoreImportQueue>());

            // Add WebDAV virtual asset store services
            services.AddVirtualAssetStore();

            return services;
        }
    }
}
