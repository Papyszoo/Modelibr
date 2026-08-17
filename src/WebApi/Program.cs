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

            // Process any backup archive staged in the restore directory BEFORE
            // any database connections are opened. If an archive is present and
            // valid, it replaces the current DB + uploads tree. Validation failures
            // move the archive to restore/failed/ and boot continues normally.
            await RestoreOnBootProcessor.RunAsync(builder.Configuration,
                LoggerFactory.Create(b => b.AddConsole()).CreateLogger("RestoreOnBoot"));

            // Allow uploads up to 1 GB (Kestrel + form options)
            const long maxFileSize = 1L * 1024 * 1024 * 1024; // 1 GB

            var disableHttpsListener = builder.Configuration.GetValue<bool>("DISABLE_HTTPS_LISTENER");
            var httpPort = builder.Configuration.GetValue<int?>("HTTP_PORT");

            X509Certificate2? selfSignedCert = null;
            if (!disableHttpsListener)
            {
                // Generate a self-signed certificate once in memory for HTTPS
                selfSignedCert = GenerateSelfSignedCertificate();
            }

            builder.WebHost.ConfigureKestrel(options =>
            {
                options.Limits.MaxRequestBodySize = maxFileSize;

                if (httpPort is > 0)
                {
                    options.ListenAnyIP(httpPort.Value);
                }

                if (disableHttpsListener)
                {
                    return;
                }

                var httpsPort = builder.Configuration.GetValue<int>("HTTPS_PORT", 8443);
                options.ListenAnyIP(httpsPort, listenOptions =>
                    listenOptions.UseHttps(selfSignedCert!));

                var expose443 = builder.Configuration.GetValue<bool>("EXPOSE_443_PORT", true);
                if (expose443 && httpsPort != 443)
                {
                    options.ListenAnyIP(443, listenOptions =>
                        listenOptions.UseHttps(selfSignedCert!));
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
            builder.Services.AddScoped<IStoreImportProgressNotifier, SignalRStoreImportProgressNotifier>();
            builder.Services.AddHostedService<UploadDirectoryInitializer>();

            // Local MCP server (prompt 27) - a thin, read-only pass-through over the
            // asset-search / metadata / compute query handlers, hosted in-process over
            // HTTP (SSE) so there's one process and one auth posture. Enabled by default;
            // set MCP_ENABLED=false to turn it off.
            var mcpEnabled = builder.Configuration["MCP_ENABLED"] != "false";
            if (mcpEnabled)
            {
                // Access tokens are parsed once, at startup, and a malformed MCP_TOKENS
                // throws here rather than being skipped: a typo that silently disabled
                // enforcement would leave an endpoint the operator believes is guarded.
                builder.Services.AddSingleton(WebApi.Mcp.McpTokenRegistry.FromConfiguration(builder.Configuration));
                builder.Services.AddScoped<WebApi.Mcp.McpCallerContext>();

                var mcpServer = builder.Services.AddMcpServer()
                    .WithHttpTransport()
                    .WithTools<WebApi.Mcp.AssetSearchMcpTools>()
                    // Reading a scene is a read: an agent that can search the library can
                    // look at what it has already built there.
                    .WithTools<WebApi.Mcp.SceneReadMcpTools>()
                    // Looking at a scene is the same read, in pixels. It is on the read
                    // side despite queueing a job and writing an image, because the
                    // alternative denies the agent that can already inspect a scene the
                    // one view that shows facing, framing and whether an asset loaded -
                    // and with writes off it can only render scenes the user made. The
                    // cost is that a reader can queue render work; if that becomes the
                    // objection, this moves behind MCP_WRITE_ENABLED.
                    .WithTools<WebApi.Mcp.SceneRenderMcpTools>();

                // Write tools (prompt 30) are opt-in: OFF by default keeps a stock server
                // read-only so enabling agent writes on a LAN-reachable endpoint is a
                // deliberate operator choice. Every write is idempotency-keyed + audited.
                var mcpWriteEnabled = builder.Configuration["MCP_WRITE_ENABLED"] == "true";
                if (mcpWriteEnabled)
                {
                    mcpServer
                        .WithTools<WebApi.Mcp.AssetWriteMcpTools>()
                        // Sounds, sprites, environment maps and texture sets. Gated by the
                        // same flag: they are writes, and splitting the gate would mean a
                        // server that is read-only for models but not for materials.
                        .WithTools<WebApi.Mcp.AssetImportMcpTools>()
                        // Undo. Registered with the write tools because reversing a write is
                        // only reachable for someone who could perform one; the destructive
                        // half of it carries its own flag and scope on top.
                        .WithTools<WebApi.Mcp.AgentUndoMcpTools>()
                        // Scene authoring. Same gate as every other write - composing a
                        // scene creates and destroys state like any other mutation.
                        .WithTools<WebApi.Mcp.SceneWriteMcpTools>()
                        .WithPrompts<WebApi.Mcp.ImportLibraryPrompts>()
                        // The playbook for building a scene. Registered with the write
                        // tools because it is a guide to writing: every stage it describes
                        // is a call that is not there without the gate.
                        .WithPrompts<WebApi.Mcp.ComposeScenePrompts>();
                }
            }
            builder.Services.AddHostedService<BlenderRetentionSweepHostedService>();

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
            if (!disableHttpsRedirection && !disableHttpsListener)
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
            app.MapExtractionEndpoints();
            app.MapFilesEndpoints();
            app.MapThumbnailEndpoints();
            app.MapThumbnailJobEndpoints();
            app.MapTextureSetEndpoints();
            app.MapMaterialEndpoints();
            app.MapTextureSetCategoryEndpoints();
            app.MapPackEndpoints();
            app.MapProjectEndpoints();
            app.MapModelCategoryEndpoints();
            app.MapStageEndpoints();
            app.MapSceneEndpoints();
            app.MapSettingsEndpoints();
            app.MapBatchUploadEndpoints();
            app.MapRecycledFilesEndpoints();
            app.MapSpriteEndpoints();
            app.MapSpriteCategoryEndpoints();
            app.MapSoundEndpoints();
            app.MapSoundCategoryEndpoints();
            app.MapScriptEndpoints();
            app.MapScriptCategoryEndpoints();
            app.MapScriptTemplateEndpoints();
            app.MapEnvironmentMapCategoryEndpoints();
            app.MapEnvironmentMapEndpoints();
            app.MapBlenderEndpoints();
            app.MapAudioSelectionEndpoints();
            app.MapBackupEndpoints();
            app.MapSearchEndpoints();
            app.MapStoreImportEndpoints();
            if (mcpEnabled)
            {
                // Exposes the MCP endpoint (SSE) at /mcp for a local agent to connect to.
                // The token filter sits at the transport so a newly added tool inherits
                // authentication instead of having to remember it; per-scope checks then
                // happen where writes and destructive work are performed.
                // Both type arguments are spelled out because MapMcp returns the general
                // IEndpointConventionBuilder, not the RouteHandlerBuilder the one-argument
                // overload of AddEndpointFilter is written against.
                app.MapMcp("/mcp")
                    .AddEndpointFilter<IEndpointConventionBuilder, WebApi.Mcp.McpTokenEndpointFilter>();
            }

            // Map SignalR hubs
            app.MapHub<ThumbnailHub>("/thumbnailHub");
            app.MapHub<ThumbnailJobHub>("/jobProcessingHub");
            app.MapHub<StoreImportHub>("/storeImportHub");

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
