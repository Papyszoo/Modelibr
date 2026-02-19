using Application;
using Infrastructure;
using Infrastructure.Extensions;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using WebApi.Endpoints;
using WebApi.Infrastructure;
using WebApi.Services;
using WebApi.Hubs;
using Application.Abstractions.Storage;
using Application.Abstractions.Services;
using Infrastructure.Storage;
using NWebDav.Server;
using NWebDav.Server.Handlers;

namespace WebApi
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Allow uploads up to 1 GB (Kestrel + form options)
            const long maxFileSize = 1L * 1024 * 1024 * 1024; // 1 GB
            builder.WebHost.ConfigureKestrel(options =>
            {
                options.Limits.MaxRequestBodySize = maxFileSize;
            });
            builder.Services.Configure<FormOptions>(options =>
            {
                options.MultipartBodyLengthLimit = maxFileSize;
            });

            builder.Services.AddAuthorization();
            builder.Services.AddHttpContextAccessor();

            builder.Services.AddHealthChecks();



            // Add CORS for frontend development
            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(policy =>
                {
                    var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() 
                        ?? new[] { "http://localhost:3000", "https://localhost:3000" };

                    policy.WithOrigins(allowedOrigins)
                          .AllowAnyMethod()
                          .AllowAnyHeader()
                          .AllowCredentials();
                });
            });

            // Add SignalR for real-time notifications
            builder.Services.AddSignalR();

            builder.Services.AddOpenApi();

            builder.Services
                .AddApplication()
                .AddInfrastructure(builder.Configuration);

            // Add NWebDav request handler factory for WebDAV support
            builder.Services.AddSingleton<IRequestHandlerFactory, WebApi.Services.RequestHandlerFactory>();

            builder.Services.AddSingleton<IUploadPathProvider, UploadPathProvider>();
            builder.Services.AddSingleton<IFileStorage, HashBasedFileStorage>();
            builder.Services.AddSingleton<IFilePreviewService, FilePreviewService>();
            builder.Services.AddSingleton<IFileThumbnailGenerator, FileThumbnailGenerator>();
            builder.Services.AddScoped<IThumbnailNotificationService, SignalRThumbnailNotificationService>();
            builder.Services.AddScoped<IThumbnailJobQueueNotificationService, SignalRThumbnailJobQueueNotificationService>();
            builder.Services.AddHostedService<UploadDirectoryInitializer>();

            var app = builder.Build();

            // Initialize database
            await app.InitializeDatabaseAsync();

            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }



            // Only use HTTPS redirection when not running in a container
            // This prevents certificate issues with internal Docker communication
            var disableHttpsRedirection = builder.Configuration.GetValue<bool>("DisableHttpsRedirection");
            if (!disableHttpsRedirection)
            {
                app.UseHttpsRedirection();
            }

            // Add CORS for frontend development
            app.UseCors();


            app.UseAuthorization();

            // Map WebDAV endpoint for virtual asset drive
            app.UseWebDav("/modelibr");

            // Map endpoints
            app.MapModelEndpoints();
            app.MapModelVersionEndpoints();
            app.MapFilesEndpoints();
            app.MapThumbnailEndpoints();
            app.MapThumbnailJobEndpoints();
            app.MapTextureSetEndpoints();
            app.MapPackEndpoints();
            app.MapProjectEndpoints();
            app.MapStageEndpoints();
            app.MapSettingsEndpoints();
            app.MapBatchUploadEndpoints();
            app.MapRecycledFilesEndpoints();
            app.MapSpriteEndpoints();
            app.MapSpriteCategoryEndpoints();
            app.MapSoundEndpoints();
            app.MapSoundCategoryEndpoints();
            app.MapBlenderEndpoints();
            app.MapAudioSelectionEndpoints();

            // Map SignalR hubs
            app.MapHub<ThumbnailHub>("/thumbnailHub");
            app.MapHub<ThumbnailJobHub>("/jobProcessingHub");

            app.MapHealthChecks("/health");

            app.Run();
        }
    }
}
