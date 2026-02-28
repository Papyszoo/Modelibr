using System.Security.Cryptography;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NWebDav.Server;
using NWebDav.Server.AspNetCore;
using NWebDav.Server.Stores;

namespace WebApi.Infrastructure;

/// <summary>
/// Middleware to handle WebDAV requests for the virtual asset drive.
/// Intercepts Blender's Safe Save procedure (PUT temp + MOVE) to create new model versions via CQRS.
/// </summary>
public class WebDavMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _pathPrefix;
    private readonly IStore _store;
    private readonly WebDavDispatcher _dispatcher;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IUploadPathProvider _pathProvider;
    private readonly ILogger<WebDavMiddleware> _logger;

    public WebDavMiddleware(
        RequestDelegate next,
        string pathPrefix,
        IStore store,
        IRequestHandlerFactory requestHandlerFactory,
        IServiceScopeFactory scopeFactory,
        IUploadPathProvider pathProvider,
        ILogger<WebDavMiddleware> logger)
    {
        _next = next;
        _pathPrefix = pathPrefix.TrimEnd('/');
        _store = store;
        _dispatcher = new WebDavDispatcher(store, requestHandlerFactory);
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Check if this is a WebDAV request for our path
        if (!context.Request.Path.StartsWithSegments(_pathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        var method = context.Request.Method.ToUpperInvariant();
        var requestPath = context.Request.Path.Value ?? string.Empty;

        // Intercept Blender Safe Save: PUT newestVersion.blend@ (temp upload)
        if (method == "PUT" && IsBlenderTempFile(requestPath))
        {
            await HandleBlenderTempPutAsync(context, requestPath);
            return;
        }

        // Intercept Blender Safe Save: MOVE newestVersion.blend@ → newestVersion.blend
        if (method == "MOVE" && IsBlenderSaveMoveDestination(context))
        {
            await HandleBlenderSaveMoveAsync(context, requestPath);
            return;
        }

        // Ignore Blender backup operations (.blend1 files or DELETE of temp files)
        if (IsBlenderBackupOperation(method, requestPath, context))
        {
            context.Response.StatusCode = 204;
            return;
        }

        // Handle all other WebDAV requests normally
        var httpContext = new AspNetCoreContext(context);
        await _dispatcher.DispatchRequestAsync(httpContext);
    }

    /// <summary>
    /// Returns true if the path ends with a Blender temporary save file pattern (newestVersion.blend@ or .tmp).
    /// </summary>
    private static bool IsBlenderTempFile(string path)
    {
        var fileName = Path.GetFileName(path);
        return fileName.EndsWith(".blend@", StringComparison.OrdinalIgnoreCase)
            || (fileName.StartsWith("newestVersion", StringComparison.OrdinalIgnoreCase)
                && fileName.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Returns true if this MOVE request's Destination ends with newestVersion.blend.
    /// </summary>
    private static bool IsBlenderSaveMoveDestination(HttpContext context)
    {
        var destination = context.Request.Headers["Destination"].ToString();
        if (string.IsNullOrEmpty(destination))
            return false;

        var destFileName = Path.GetFileName(new Uri(destination).AbsolutePath);
        return destFileName.Equals("newestVersion.blend", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Returns true if this is a Blender backup operation that should be silently ignored:
    /// - MOVE *newestVersion.blend → *.blend1 (Blender backup rename)
    /// - DELETE *.blend1 (Blender cleanup of old backup)
    /// </summary>
    private static bool IsBlenderBackupOperation(string method, string requestPath, HttpContext context)
    {
        var fileName = Path.GetFileName(requestPath);

        // DELETE of .blend1 backup file
        if (method == "DELETE" && fileName.EndsWith(".blend1", StringComparison.OrdinalIgnoreCase))
            return true;

        // MOVE where destination is a .blend1 backup file
        if (method == "MOVE")
        {
            var destination = context.Request.Headers["Destination"].ToString();
            if (!string.IsNullOrEmpty(destination))
            {
                var destFileName = Path.GetFileName(new Uri(destination).AbsolutePath);
                if (destFileName.EndsWith(".blend1", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Handles PUT of Blender temp file (newestVersion.blend@).
    /// Saves content to a temporary folder keyed by normalized model path. Returns 201 Created.
    /// </summary>
    private async Task HandleBlenderTempPutAsync(HttpContext context, string requestPath)
    {
        var tempKey = GetTempFileKey(requestPath);
        var tempDir = Path.Combine(_pathProvider.UploadRootPath, "webdav-blend-temp");
        Directory.CreateDirectory(tempDir);
        var tempFilePath = Path.Combine(tempDir, tempKey);

        try
        {
            await using var fs = System.IO.File.Create(tempFilePath);
            await context.Request.Body.CopyToAsync(fs, context.RequestAborted);
            _logger.LogDebug("Stored Blender temp file at {TempPath} for {RequestPath}", tempFilePath, requestPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to store Blender temp file for {RequestPath}", requestPath);
            context.Response.StatusCode = 500;
            return;
        }

        context.Response.StatusCode = 201;
    }

    /// <summary>
    /// Handles MOVE newestVersion.blend@ → newestVersion.blend.
    /// Compares hashes; if different, fires CreateModelVersionCommand + AddFileToVersionCommand.
    /// </summary>
    private async Task HandleBlenderSaveMoveAsync(HttpContext context, string requestPath)
    {
        var tempKey = GetTempFileKey(requestPath);
        var tempFilePath = Path.Combine(_pathProvider.UploadRootPath, "webdav-blend-temp", tempKey);

        if (!System.IO.File.Exists(tempFilePath))
        {
            _logger.LogWarning("Blender MOVE intercepted but temp file not found at {TempPath}", tempFilePath);
            // Return success anyway so Blender is not confused
            context.Response.StatusCode = 204;
            return;
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var sp = scope.ServiceProvider;

            // Resolve the model from the path (e.g. /modelibr/Projects/P/Models/M/newestVersion.blend@)
            var modelInfo = await ResolveModelInfoFromPathAsync(sp, requestPath);
            if (modelInfo == null)
            {
                _logger.LogWarning("Could not resolve model from path {RequestPath}", requestPath);
                System.IO.File.Delete(tempFilePath);
                context.Response.StatusCode = 204;
                return;
            }

            var (modelId, currentBlendHash) = modelInfo.Value;

            // Calculate hash of the uploaded temp file
            var uploadedHash = await ComputeSha256Async(tempFilePath);

            if (string.Equals(uploadedHash, currentBlendHash, StringComparison.OrdinalIgnoreCase))
            {
                // Content identical — no new version needed
                _logger.LogDebug("Blender save: content unchanged for model {ModelId}, skipping version creation", modelId);
            }
            else
            {
                // Content changed — create a new version via CQRS
                _logger.LogInformation("Blender save: content changed for model {ModelId}, creating new version", modelId);

                var fileInfo = new System.IO.FileInfo(tempFilePath);
                var fileUpload = new BlenderFileUpload("newestVersion.blend", tempFilePath, fileInfo.Length);

                var createVersionHandler = sp.GetRequiredService<ICommandHandler<CreateModelVersionCommand, CreateModelVersionResponse>>();
                var createResult = await createVersionHandler.Handle(
                    new CreateModelVersionCommand(modelId, fileUpload),
                    context.RequestAborted);

                if (createResult.IsFailure)
                {
                    _logger.LogError("Failed to create new model version for model {ModelId}: {Error}", modelId, createResult.Error?.Message);
                    context.Response.StatusCode = 500;
                    return;
                }

                _logger.LogInformation("Created model version {VersionId} for model {ModelId} via Blender save",
                    createResult.Value.VersionId, modelId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Blender save MOVE for {RequestPath}", requestPath);
            context.Response.StatusCode = 500;
            return;
        }
        finally
        {
            try { System.IO.File.Delete(tempFilePath); } catch (Exception ex) { _logger.LogWarning(ex, "Failed to cleanup Blender temp file {Path}", tempFilePath); }
        }

        context.Response.StatusCode = 204;
    }

    /// <summary>
    /// Derives the temp file key from a path like .../ModelName/newestVersion.blend@
    /// Key is a safe filename encoding the normalized model folder path.
    /// </summary>
    private static string GetTempFileKey(string requestPath)
    {
        // Remove the last segment (the temp filename) to get the model folder path
        var segments = requestPath.TrimEnd('/').Split('/');
        var modelPath = string.Join("/", segments[..^1]).ToLowerInvariant();
        var keyBytes = System.Text.Encoding.UTF8.GetBytes(modelPath);
        var keyHash = Convert.ToHexString(SHA256.HashData(keyBytes)).ToLowerInvariant();
        return keyHash + ".tmp";
    }

    /// <summary>
    /// Resolves the model ID and current blend file hash from the WebDAV request path.
    /// Expects path like: /modelibr/Projects/{ProjectName}/Models/{ModelName}/newestVersion.blend@
    /// </summary>
    private async Task<(int ModelId, string? CurrentBlendHash)?> ResolveModelInfoFromPathAsync(IServiceProvider sp, string requestPath)
    {
        // Normalize path: strip prefix and decode segments
        var path = requestPath;
        var prefix = _pathPrefix.TrimEnd('/');
        if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            path = path[prefix.Length..];

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries)
                           .Select(Uri.UnescapeDataString)
                           .ToArray();

        // Expect: Projects / {ProjectName} / Models / {ModelName} / newestVersion.blend@
        if (segments.Length < 5)
            return null;

        if (!segments[0].Equals("Projects", StringComparison.OrdinalIgnoreCase) ||
            !segments[2].Equals("Models", StringComparison.OrdinalIgnoreCase))
            return null;

        var projectName = segments[1];
        var modelName = segments[3];

        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        var newestVersionFiles = await dbContext.Set<Domain.Models.Model>()
            .AsNoTracking()
            .Where(m => !m.IsDeleted && m.Projects.Any(p => p.Name == projectName) && m.Name == modelName)
            .SelectMany(m => m.Versions.Where(v => !v.IsDeleted).OrderByDescending(v => v.VersionNumber).Take(1))
            .Include(v => v.Files)
            .FirstOrDefaultAsync();

        if (newestVersionFiles == null)
            return null;

        var model = await dbContext.Set<Domain.Models.Model>()
            .AsNoTracking()
            .Where(m => !m.IsDeleted && m.Projects.Any(p => p.Name == projectName) && m.Name == modelName)
            .Select(m => new { m.Id })
            .FirstOrDefaultAsync();

        if (model == null)
            return null;

        var blendFile = newestVersionFiles.Files
            .FirstOrDefault(f => f.OriginalFileName.EndsWith(".blend", StringComparison.OrdinalIgnoreCase));

        return (model.Id, blendFile?.Sha256Hash);
    }

    private static async Task<string> ComputeSha256Async(string filePath)
    {
        using var sha = SHA256.Create();
        await using var fs = System.IO.File.OpenRead(filePath);
        var hashBytes = await sha.ComputeHashAsync(fs);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}

/// <summary>
/// Extension methods for WebDAV middleware registration.
/// </summary>
public static class WebDavMiddlewareExtensions
{
    /// <summary>
    /// Adds WebDAV endpoint at the specified path.
    /// </summary>
    public static IApplicationBuilder UseWebDav(this IApplicationBuilder app, string path = "/dav")
    {
        var store = app.ApplicationServices.GetRequiredService<IStore>();
        var requestHandlerFactory = app.ApplicationServices.GetRequiredService<IRequestHandlerFactory>();
        var scopeFactory = app.ApplicationServices.GetRequiredService<IServiceScopeFactory>();
        var pathProvider = app.ApplicationServices.GetRequiredService<IUploadPathProvider>();
        var logger = app.ApplicationServices.GetRequiredService<ILogger<WebDavMiddleware>>();

        return app.UseMiddleware<WebDavMiddleware>(path, store, requestHandlerFactory, scopeFactory, pathProvider, logger);
    }
}

/// <summary>
/// Stream-based IFileUpload implementation for uploading a Blender-saved file from a temp path.
/// </summary>
internal sealed class BlenderFileUpload : IFileUpload
{
    private readonly string _filePath;

    public BlenderFileUpload(string fileName, string filePath, long length)
    {
        FileName = fileName;
        _filePath = filePath;
        Length = length;
    }

    public string FileName { get; }
    public string ContentType => "application/octet-stream";
    public long Length { get; }

    public Stream OpenRead() => System.IO.File.OpenRead(_filePath);

    public async Task CopyToAsync(Stream target, CancellationToken cancellationToken = default)
    {
        await using var fs = System.IO.File.OpenRead(_filePath);
        await fs.CopyToAsync(target, cancellationToken);
    }
}
