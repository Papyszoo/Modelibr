using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
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

            // Generate a self-signed certificate once in memory for HTTPS
            var selfSignedCert = GenerateSelfSignedCertificate();

            builder.WebHost.ConfigureKestrel(options =>
            {
                options.Limits.MaxRequestBodySize = maxFileSize;

                var httpsPort = builder.Configuration.GetValue<int>("HTTPS_PORT", 8443);
                options.ListenAnyIP(httpsPort, listenOptions =>
                    listenOptions.UseHttps(selfSignedCert));

                var expose443 = builder.Configuration.GetValue<bool>("EXPOSE_443_PORT", true);
                if (expose443 && httpsPort != 443)
                {
                    options.ListenAnyIP(443, listenOptions =>
                        listenOptions.UseHttps(selfSignedCert));
                }
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
                        ?? new[] { "http://localhost:3010", "https://localhost:3010" };

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
            app.MapModelCategoryEndpoints();
            app.MapStageEndpoints();
            app.MapSettingsEndpoints();
            app.MapBatchUploadEndpoints();
            app.MapRecycledFilesEndpoints();
            app.MapSpriteEndpoints();
            app.MapSpriteCategoryEndpoints();
            app.MapSoundEndpoints();
            app.MapSoundCategoryEndpoints();
            app.MapEnvironmentMapEndpoints();
            app.MapBlenderEndpoints();
            app.MapAudioSelectionEndpoints();

            // Map SignalR hubs
            app.MapHub<ThumbnailHub>("/thumbnailHub");
            app.MapHub<ThumbnailJobHub>("/jobProcessingHub");

            app.MapHealthChecks("/health");

            app.Run();
        }

        /// <summary>
        /// Generates an in-memory self-signed certificate for HTTPS.
        /// </summary>
        private static X509Certificate2 GenerateSelfSignedCertificate()
        {
            using var rsa = RSA.Create(2048);
            var request = new CertificateRequest(
                "CN=Modelibr Self-Signed",
                rsa,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);

            request.CertificateExtensions.Add(
                new X509BasicConstraintsExtension(false, false, 0, false));
            request.CertificateExtensions.Add(
                new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, false));

            var sanBuilder = new SubjectAlternativeNameBuilder();
            sanBuilder.AddDnsName("localhost");
            sanBuilder.AddDnsName("webapi");
            request.CertificateExtensions.Add(sanBuilder.Build());

            var cert = request.CreateSelfSigned(
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow.AddYears(5));

            // Export and re-import so the private key is fully usable on all platforms
            return X509CertificateLoader.LoadPkcs12(
                cert.Export(X509ContentType.Pfx), null);
        }
    }
}
