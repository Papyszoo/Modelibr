using System.Security.Cryptography;
using Application.Abstractions.Repositories;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Application.Models;
using Application.Settings;
using Infrastructure.Persistence;
using Infrastructure.WebDav;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
    private readonly BlenderTempFileQuarantine _orphanQuarantine;

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
        _orphanQuarantine = new BlenderTempFileQuarantine(pathProvider, logger);
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

        // Silently discard macOS AppleDouble resource fork files (._filename).
        // macOS Finder writes these 4096-byte metadata companion files alongside every real file
        // when copying to a non-HFS filesystem (e.g. WebDAV). They are NOT valid .blend files
        // and must not be stored as model records. Return the most appropriate success code
        // per method so the OS does not retry or show an error to the user.
        var requestFileName = Path.GetFileName(requestPath);
        if (requestFileName.StartsWith("._", StringComparison.Ordinal))
        {
            context.Response.StatusCode = method switch
            {
                "DELETE" => 204,
                "GET" or "HEAD" or "PROPFIND" => 404,
                _        => 201, // PUT, LOCK, PROPFIND, etc. — appear to succeed
            };
            _logger.LogDebug("Ignored macOS AppleDouble file {FileName} ({Method})", requestFileName, method);
            return;
        }

        // Intercept Blender Safe Save: PUT generated-/uploaded-{model.Name}.blend@ (temp upload)
        if (method == "PUT" && IsBlenderTempFile(requestPath))
        {
            await HandleBlenderTempPutAsync(context, requestPath);
            return;
        }

        // Intercept Blender Safe Save: MOVE generated-/uploaded-{model.Name}.blend@ → generated-/uploaded-{model.Name}.blend
        if (method == "MOVE" && IsBlenderSaveMoveDestination(context))
        {
            await HandleBlenderSaveMoveAsync(context, requestPath);
            return;
        }

        // Handle verification/property requests for Blender temp files.
        // Windows WebDAV MiniRedirector sends HEAD, PROPFIND, and PROPPATCH after PUT
        // to verify the file was written. Without these, Windows considers the write failed
        // and Blender reports "Cannot change old file (file saved with @)".
        if (IsBlenderTempFile(requestPath) && method is "HEAD" or "GET" or "PROPFIND" or "PROPPATCH" or "DELETE")
        {
            await HandleBlenderTempFileRequestAsync(context, method, requestPath);
            return;
        }

        // Ignore Blender backup operations (.blend1 files or DELETE of temp files)
        if (IsBlenderBackupOperation(method, requestPath, context))
        {
            context.Response.StatusCode = 204;
            return;
        }

        // Intercept LOCK for new .blend model paths.
        // macOS Finder (and some Windows clients) send LOCK before PUT when writing a new file.
        // We handle LOCK ourselves so the NWebDav library cannot interfere with the PUT body
        // and so concurrent locks for different files don't block each other.
        if (method == "LOCK" && IsNewModelBlendPut(requestPath))
        {
            await HandleSyntheticLockAsync(context, requestPath);
            return;
        }

        // Intercept UNLOCK for the same paths — always succeed silently.
        if (method == "UNLOCK" && IsNewModelBlendPut(requestPath))
        {
            context.Response.StatusCode = 204;
            return;
        }

        // Intercept LOCK for existing generated-/uploaded-{model}.blend paths.
        // Without this, NWebDav's NoLockingManager returns 403 Forbidden, which
        // prevents macOS WebDAV clients (and Blender) from saving edits to the file.
        if (method == "LOCK" && IsExistingBlendFile(requestPath))
        {
            // Return 200 (lock on existing resource) instead of 201 (new resource)
            await HandleExistingBlendLockAsync(context, requestPath);
            return;
        }

        if (method == "UNLOCK" && IsExistingBlendFile(requestPath))
        {
            context.Response.StatusCode = 204;
            return;
        }

        // Intercept PUT /modelibr/Models/{filename}.blend — create a new model from .blend
        if (method == "PUT" && IsNewModelBlendPut(requestPath))
        {
            await HandleNewModelBlendPutAsync(context, requestPath);
            return;
        }

        // Handle all other WebDAV requests normally.
        // NWebDav's handlers (e.g. PropFindHandler) call Response.Write synchronously.
        // Kestrel blocks sync I/O by default, so we opt-in per-request here.
        var bodyControlFeature = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpBodyControlFeature>();
        if (bodyControlFeature != null)
            bodyControlFeature.AllowSynchronousIO = true;

        var httpContext = new AspNetCoreContext(context);
        await _dispatcher.DispatchRequestAsync(httpContext);
    }

    /// <summary>
    /// Returns true if the path ends with generated-{name}.blend or uploaded-{name}.blend.
    /// Used to intercept LOCK/UNLOCK for virtual .blend files so that NWebDav's NoLockingManager
    /// doesn't return 403 Forbidden and block saves.
    /// </summary>
    private static bool IsExistingBlendFile(string path)
    {
        var fileName = Path.GetFileName(path);
        return (fileName.StartsWith("generated-", StringComparison.OrdinalIgnoreCase)
                || fileName.StartsWith("uploaded-", StringComparison.OrdinalIgnoreCase))
            && fileName.EndsWith(".blend", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Returns true if the path ends with a Blender temporary save file pattern
    /// (generated-/uploaded-{name}.blend@ or .tmp).
    /// </summary>
    private static bool IsBlenderTempFile(string path)
    {
        var fileName = Path.GetFileName(path);
        return fileName.EndsWith(".blend@", StringComparison.OrdinalIgnoreCase)
            || ((fileName.StartsWith("generated-", StringComparison.OrdinalIgnoreCase)
                 || fileName.StartsWith("uploaded-", StringComparison.OrdinalIgnoreCase))
                && fileName.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Returns true if this MOVE request's Destination ends with generated-{name}.blend or uploaded-{name}.blend.
    /// </summary>
    private static bool IsBlenderSaveMoveDestination(HttpContext context)
    {
        var destination = context.Request.Headers["Destination"].ToString();
        if (string.IsNullOrEmpty(destination))
            return false;

        // Destination may be an absolute URI (RFC 4918) or a relative path.
        // Use Uri.TryCreate so we never throw on malformed values.
        string destPath;
        if (Uri.TryCreate(destination, UriKind.Absolute, out var absUri))
            destPath = absUri.AbsolutePath;
        else
            destPath = destination; // treat as raw path

        var destFileName = Path.GetFileName(destPath.TrimEnd('/'));
        return (destFileName.StartsWith("generated-", StringComparison.OrdinalIgnoreCase)
                || destFileName.StartsWith("uploaded-", StringComparison.OrdinalIgnoreCase))
            && destFileName.EndsWith(".blend", StringComparison.OrdinalIgnoreCase);
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
                string destPath;
                if (Uri.TryCreate(destination, UriKind.Absolute, out var absUri))
                    destPath = absUri.AbsolutePath;
                else
                    destPath = destination;

                var destFileName = Path.GetFileName(destPath.TrimEnd('/'));
                if (destFileName.EndsWith(".blend1", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Handles HEAD, GET, PROPFIND, PROPPATCH, and DELETE for Blender temp files.
    /// Windows WebDAV MiniRedirector sends these after PUT to verify/configure the temp file.
    /// </summary>
    private async Task HandleBlenderTempFileRequestAsync(HttpContext context, string method, string requestPath)
    {
        var tempKey = GetTempFileKey(requestPath);
        var tempFilePath = Path.Combine(_pathProvider.UploadRootPath, "webdav-blend-temp", tempKey);

        if (!System.IO.File.Exists(tempFilePath))
        {
            _logger.LogDebug("Blender temp file {Method} for {Path} — no temp file found", method, requestPath);
            context.Response.StatusCode = 404;
            return;
        }

        var fileInfo = new System.IO.FileInfo(tempFilePath);

        switch (method)
        {
            case "HEAD":
                context.Response.StatusCode = 200;
                context.Response.ContentType = "application/octet-stream";
                context.Response.ContentLength = fileInfo.Length;
                context.Response.Headers["Last-Modified"] = fileInfo.LastWriteTimeUtc.ToString("R");
                break;

            case "GET":
                context.Response.StatusCode = 200;
                context.Response.ContentType = "application/octet-stream";
                context.Response.ContentLength = fileInfo.Length;
                context.Response.Headers["Last-Modified"] = fileInfo.LastWriteTimeUtc.ToString("R");
                await using (var fs = System.IO.File.OpenRead(tempFilePath))
                {
                    await fs.CopyToAsync(context.Response.Body, context.RequestAborted);
                }
                break;

            case "PROPFIND":
            {
                var href = System.Security.SecurityElement.Escape(context.Request.Path.Value ?? requestPath);
                var lastModified = fileInfo.LastWriteTimeUtc.ToString("R");
                var creationDate = fileInfo.CreationTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ");
                var xml =
                    "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                    "<D:multistatus xmlns:D=\"DAV:\">" +
                    "<D:response>" +
                    $"<D:href>{href}</D:href>" +
                    "<D:propstat>" +
                    "<D:prop>" +
                    "<D:resourcetype/>" +
                    $"<D:getcontentlength>{fileInfo.Length}</D:getcontentlength>" +
                    $"<D:getlastmodified>{lastModified}</D:getlastmodified>" +
                    $"<D:creationdate>{creationDate}</D:creationdate>" +
                    "<D:getcontenttype>application/octet-stream</D:getcontenttype>" +
                    "</D:prop>" +
                    "<D:status>HTTP/1.1 200 OK</D:status>" +
                    "</D:propstat>" +
                    "</D:response>" +
                    "</D:multistatus>";
                context.Response.StatusCode = 207;
                context.Response.ContentType = "application/xml; charset=utf-8";
                await context.Response.WriteAsync(xml);
                break;
            }

            case "PROPPATCH":
            {
                // Accept property changes silently (Windows sets Win32 timestamps)
                var href = System.Security.SecurityElement.Escape(context.Request.Path.Value ?? requestPath);
                var xml =
                    "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                    "<D:multistatus xmlns:D=\"DAV:\">" +
                    "<D:response>" +
                    $"<D:href>{href}</D:href>" +
                    "<D:propstat>" +
                    "<D:prop/>" +
                    "<D:status>HTTP/1.1 200 OK</D:status>" +
                    "</D:propstat>" +
                    "</D:response>" +
                    "</D:multistatus>";
                context.Response.StatusCode = 207;
                context.Response.ContentType = "application/xml; charset=utf-8";
                await context.Response.WriteAsync(xml);
                break;
            }

            case "DELETE":
                try { System.IO.File.Delete(tempFilePath); }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to delete Blender temp file {Path}", tempFilePath); }
                context.Response.StatusCode = 204;
                break;
        }
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
    /// Handles MOVE generated-/uploaded-{model.Name}.blend@ → generated-/uploaded-{model.Name}.blend.
    /// Compares hashes; if different, fires CreateModelVersionCommand + AddFileToVersionCommand.
    /// </summary>
    private async Task HandleBlenderSaveMoveAsync(HttpContext context, string requestPath)
    {
        var tempKey = GetTempFileKey(requestPath);
        var tempFilePath = Path.Combine(_pathProvider.UploadRootPath, "webdav-blend-temp", tempKey);

        if (!System.IO.File.Exists(tempFilePath))
        {
            // No bytes were ever saved for this MOVE — nothing to quarantine or delete,
            // just let Blender continue (it has nothing to lose here).
            _logger.LogWarning("Blender MOVE intercepted but temp file not found at {TempPath}", tempFilePath);
            context.Response.StatusCode = 204;
            return;
        }

        // Data-safety rule: an unprocessed temp file is never deleted on failure — it is
        // quarantined (moved + sidecar) so the artist's bytes survive. quarantineReason
        // stays null on every success/no-op path, so the `finally` below only quarantines
        // when something actually went wrong.
        string? quarantineReason = null;
        IReadOnlyCollection<int>? quarantineCandidateIds = null;

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var sp = scope.ServiceProvider;

            // Resolve the model from the path (e.g. /modelibr/Projects/P/Models/M/uploaded-{modelName}.blend@)
            var resolution = await ResolveModelInfoFromPathAsync(sp, requestPath);
            if (resolution.Model == null)
            {
                quarantineReason = resolution.Ambiguous ? "ambiguous model name" : "unresolvable model path";
                quarantineCandidateIds = resolution.CandidateModelIds;
                _logger.LogWarning(
                    "Could not resolve model from path {RequestPath} (reason={Reason})", requestPath, quarantineReason);
                context.Response.StatusCode = 204;
                return;
            }

            var (modelId, modelName, currentBlendHash) = resolution.Model.Value;

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
                var fileUpload = new BlenderFileUpload($"{modelName}.blend", tempFilePath, fileInfo.Length);

                var createVersionHandler = sp.GetRequiredService<ICommandHandler<CreateModelVersionCommand, CreateModelVersionResponse>>();
                var createResult = await createVersionHandler.Handle(
                    new CreateModelVersionCommand(modelId, fileUpload),
                    context.RequestAborted);

                if (createResult.IsFailure)
                {
                    // DuplicateFile means the saved content already exists in a previous version.
                    // Treat as success (204) so Blender is not confused — the data is already stored.
                    // All other failures are real errors and should surface as 500 — and the bytes
                    // must be quarantined, not discarded, since they were never persisted.
                    if (createResult.Error?.Code == "DuplicateFile")
                    {
                        _logger.LogInformation("Blender save: file content matches an existing version for model {ModelId}, treating as no-op", modelId);
                    }
                    else
                    {
                        _logger.LogError("Failed to create new model version for model {ModelId}: {Error}", modelId, createResult.Error?.Message);
                        quarantineReason = $"CreateModelVersion failed: {createResult.Error?.Code}";
                        quarantineCandidateIds = new[] { modelId };
                        context.Response.StatusCode = 500;
                        return;
                    }
                }
                else
                {
                    _logger.LogInformation("Created model version {VersionId} for model {ModelId} via Blender save",
                        createResult.Value.VersionId, modelId);

                    // Dispatch ModelUploadedEvent so the asset-processor picks up the
                    // .blend file, converts it to .glb, and generates a thumbnail.
                    // The CreateModelVersionCommandHandler only raises this event for
                    // renderable file types; .blend is a project file, so we raise it manually.
                    var dispatcher = sp.GetRequiredService<IDomainEventDispatcher>();
                    var uploadedEvent = new Domain.Events.ModelUploadedEvent(
                        modelId,
                        createResult.Value.VersionId,
                        uploadedHash,
                        isNewModel: false);
                    await dispatcher.PublishAsync(new[] { uploadedEvent }, context.RequestAborted);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Blender save MOVE for {RequestPath}", requestPath);
            quarantineReason = $"unhandled exception: {ex.GetType().Name}";
            context.Response.StatusCode = 500;
            return;
        }
        finally
        {
            if (quarantineReason != null)
            {
                // No cancellation token on purpose — a client that disconnects mid-failure
                // must not be able to cancel the data-safety move/sidecar write.
                await _orphanQuarantine.QuarantineAsync(
                    tempFilePath, requestPath, quarantineReason, quarantineCandidateIds);
            }
            else
            {
                // Content is safely persisted (or was a no-op) — the temp copy is no longer needed.
                try { System.IO.File.Delete(tempFilePath); } catch (Exception ex) { _logger.LogWarning(ex, "Failed to cleanup Blender temp file {Path}", tempFilePath); }
            }
        }

        context.Response.StatusCode = 204;
    }

    /// <summary>
    /// Returns true if this is a PUT of a .blend file directly into the Models folder
    /// (e.g. PUT /modelibr/Models/MyModel.blend) — used to create a new model.
    /// </summary>
    private bool IsNewModelBlendPut(string requestPath)
    {
        var path = requestPath;
        var prefix = _pathPrefix.TrimEnd('/');
        if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            path = path[prefix.Length..];

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);

        // Expect exactly: Models / {filename}.blend
        if (segments.Length != 2)
            return false;

        if (!segments[0].Equals("Models", StringComparison.OrdinalIgnoreCase))
            return false;

        var fileName = segments[1];
        return fileName.EndsWith(".blend", StringComparison.OrdinalIgnoreCase)
            && !fileName.StartsWith("generated-", StringComparison.OrdinalIgnoreCase)
            && !fileName.StartsWith("uploaded-", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Returns a synthetic WebDAV lock token for a new .blend file path.
    /// macOS Finder (and some Windows clients) require a LOCK response before PUT-ing a new file.
    /// We generate a per-request UUID token which we do not actually enforce — its sole purpose
    /// is to satisfy the client so the subsequent PUT proceeds and carries the full file body.
    /// </summary>
    private async Task HandleSyntheticLockAsync(HttpContext context, string requestPath)
    {
        var lockToken = $"urn:uuid:{Guid.NewGuid()}";
        var escapedPath = System.Security.SecurityElement.Escape(requestPath);
        var xml =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
            "<D:prop xmlns:D=\"DAV:\">" +
            "<D:lockdiscovery>" +
            "<D:activelock>" +
            "<D:locktype><D:write/></D:locktype>" +
            "<D:lockscope><D:exclusive/></D:lockscope>" +
            "<D:depth>0</D:depth>" +
            "<D:timeout>Second-3600</D:timeout>" +
            $"<D:locktoken><D:href>{lockToken}</D:href></D:locktoken>" +
            $"<D:lockroot><D:href>{escapedPath}</D:href></D:lockroot>" +
            "</D:activelock>" +
            "</D:lockdiscovery>" +
            "</D:prop>";

        // 201 = file stub created + locked (new resource); 200 = locked existing resource.
        // We always return 201 since the .blend does not yet exist in our store.
        context.Response.StatusCode = 201;
        context.Response.ContentType = "application/xml; charset=utf-8";
        context.Response.Headers["Lock-Token"] = $"<{lockToken}>";
        await context.Response.WriteAsync(xml);
        _logger.LogDebug("Synthetic LOCK returned for {Path} (token={Token})", requestPath, lockToken);
    }

    /// <summary>
    /// Returns a synthetic WebDAV lock token for an existing generated-/uploaded-{model}.blend file.
    /// Without this, NWebDav's NoLockingManager returns 403 Forbidden, preventing saves.
    /// </summary>
    private async Task HandleExistingBlendLockAsync(HttpContext context, string requestPath)
    {
        var lockToken = $"urn:uuid:{Guid.NewGuid()}";
        var escapedPath = System.Security.SecurityElement.Escape(requestPath);
        var xml =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
            "<D:prop xmlns:D=\"DAV:\">" +
            "<D:lockdiscovery>" +
            "<D:activelock>" +
            "<D:locktype><D:write/></D:locktype>" +
            "<D:lockscope><D:exclusive/></D:lockscope>" +
            "<D:depth>0</D:depth>" +
            "<D:timeout>Second-3600</D:timeout>" +
            $"<D:locktoken><D:href>{lockToken}</D:href></D:locktoken>" +
            $"<D:lockroot><D:href>{escapedPath}</D:href></D:lockroot>" +
            "</D:activelock>" +
            "</D:lockdiscovery>" +
            "</D:prop>";

        // 200 = locked existing resource (unlike 201 for new resources)
        context.Response.StatusCode = 200;
        context.Response.ContentType = "application/xml; charset=utf-8";
        context.Response.Headers["Lock-Token"] = $"<{lockToken}>";
        await context.Response.WriteAsync(xml);
        _logger.LogDebug("Existing blend LOCK returned for {Path} (token={Token})", requestPath, lockToken);
    }

    /// <summary>
    /// Handles PUT /modelibr/Models/{filename}.blend — creates a new model from a .blend file.
    /// Returns 403 when Blender integration is disabled or installation is in progress, 201 on success.
    /// </summary>
    private async Task HandleNewModelBlendPutAsync(HttpContext context, string requestPath)
    {
        var installService = context.RequestServices.GetRequiredService<IBlenderInstallationService>();
        var status = installService.GetStatus();

        if (status.State is "downloading" or "extracting")
        {
            _logger.LogWarning("PUT .blend rejected: Blender installation is in progress (state={State})", status.State);
            context.Response.StatusCode = 403;
            await context.Response.WriteAsync("Blender installation is in progress");
            return;
        }

        var settingRepository = context.RequestServices.GetRequiredService<ISettingRepository>();
        var blenderEnabledSetting = await settingRepository.GetByKeyAsync(SettingKeys.BlenderEnabled, context.RequestAborted);
        var blenderEnabled = bool.TryParse(blenderEnabledSetting?.Value, out var parsedEnabled) && parsedEnabled;

        if (!blenderEnabled)
        {
            _logger.LogWarning("PUT .blend rejected: Blender integration is disabled in settings");
            context.Response.StatusCode = 403;
            await context.Response.WriteAsync("Blender integration is disabled");
            return;
        }

        // Extract model name from filename
        var fileName = Path.GetFileName(requestPath);
        var modelName = Path.GetFileNameWithoutExtension(fileName);

        // Save the uploaded body to a temp file
        var tempDir = Path.Combine(_pathProvider.UploadRootPath, "webdav-blend-temp");
        Directory.CreateDirectory(tempDir);
        var tempFilePath = Path.Combine(tempDir, $"new-model-{Guid.NewGuid()}.blend");

        try
        {
            await using (var fs = System.IO.File.Create(tempFilePath))
            {
                await context.Request.Body.CopyToAsync(fs, context.RequestAborted);
            }

            var fileInfo = new System.IO.FileInfo(tempFilePath);

            // Guard: some WebDAV clients (macOS Finder, Windows) send an initial 0-byte PUT
            // to "create" the file slot before sending a LOCK + actual-content PUT.
            // Storing a 0-byte .blend produces a corrupted model that Blender cannot open.
            // Return 201 (success) so the client does not retry endlessly, but skip model
            // creation — the follow-up PUT with real content will create the model.
            if (fileInfo.Length == 0)
            {
                _logger.LogWarning(
                    "PUT .blend '{FileName}' has 0-byte body — returning 201 without creating a model (pre-create stub)",
                    fileName);
                context.Response.StatusCode = 201;
                return;
            }
            var fileUpload = new BlenderFileUpload(fileName, tempFilePath, fileInfo.Length);

            using var scope = _scopeFactory.CreateScope();
            var handler = scope.ServiceProvider
                .GetRequiredService<ICommandHandler<CreateModelFromBlendCommand, CreateModelFromBlendResponse>>();

            var result = await handler.Handle(
                new CreateModelFromBlendCommand(modelName, fileUpload),
                context.RequestAborted);

            if (result.IsFailure)
            {
                if (result.Error.Code == "ModelNameAlreadyExists")
                {
                    _logger.LogWarning("WebDAV .blend PUT rejected: {Error}", result.Error.Message);
                    context.Response.StatusCode = 409; // Conflict
                    await context.Response.WriteAsync(result.Error.Message);
                    return;
                }

                _logger.LogError("Failed to create model from .blend: {Error}", result.Error.Message);
                context.Response.StatusCode = 500;
                await context.Response.WriteAsync(result.Error.Message);
                return;
            }

            _logger.LogInformation("Created model {ModelId} from WebDAV .blend PUT (alreadyExists={AlreadyExists})",
                result.Value.ModelId, result.Value.AlreadyExists);

            context.Response.StatusCode = 201;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling new model .blend PUT for {RequestPath}", requestPath);
            context.Response.StatusCode = 500;
        }
        finally
        {
            try { System.IO.File.Delete(tempFilePath); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to cleanup temp file {Path}", tempFilePath); }
        }
    }

    /// <summary>
    /// Derives the temp file key from a path like .../ModelName/generated-{modelName}.blend@
    /// or .../ModelName/uploaded-{modelName}.blend@.
    /// Key is a safe filename encoding the normalized model folder path + the blend file prefix
    /// so that generated and uploaded temp files don't collide.
    /// </summary>
    private static string GetTempFileKey(string requestPath)
    {
        // Include the filename (minus the temp suffix) in the hash input
        // so that generated-X.blend@ and uploaded-X.blend@ produce different temp files
        var segments = requestPath.TrimEnd('/').Split('/');
        var modelPath = string.Join("/", segments[..^1]).ToLowerInvariant();
        var fileName = segments[^1].ToLowerInvariant();
        // Strip temp suffixes (.blend@, .tmp) to get the base blend filename for hashing
        if (fileName.EndsWith(".blend@", StringComparison.OrdinalIgnoreCase))
            fileName = fileName[..^1]; // remove trailing @
        else if (fileName.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase))
            fileName = fileName[..^4] + ".blend";
        var keyInput = modelPath + "/" + fileName;
        var keyBytes = System.Text.Encoding.UTF8.GetBytes(keyInput);
        var keyHash = Convert.ToHexString(SHA256.HashData(keyBytes)).ToLowerInvariant();
        return keyHash + ".tmp";
    }

    /// <summary>
    /// Result of resolving a model from a WebDAV request path. <see cref="Model"/> is null
    /// when the model could not be resolved; <see cref="Ambiguous"/> distinguishes "matched
    /// nothing" from "matched more than one" (the plain-name fallback never guesses among
    /// duplicates) so the caller can pick the right quarantine reason and log the candidates.
    /// </summary>
    private readonly record struct ModelPathResolution(
        (int ModelId, string ModelName, string? CurrentBlendHash)? Model,
        bool Ambiguous,
        IReadOnlyCollection<int>? CandidateModelIds)
    {
        public static readonly ModelPathResolution NotFound = new(null, false, null);
    }

    /// <summary>
    /// Resolves the model ID, name, and current blend file hash from the WebDAV request path.
    /// Supports both project-based and global model paths:
    ///   /modelibr/Projects/{ProjectName}/Models/{ModelName}/generated-{modelName}.blend@
    ///   /modelibr/Projects/{ProjectName}/Models/{ModelName}/uploaded-{modelName}.blend@
    ///   /modelibr/Models/{ModelName}/generated-{modelName}.blend@
    ///   /modelibr/Models/{ModelName}/uploaded-{modelName}.blend@
    /// The {ModelName} segment is resolved via the shared WebDAV disambiguation contract:
    /// an "{name} [{id}]" suffix resolves directly by id; otherwise the plain segment is
    /// matched case-insensitively (WebDAV clients on Windows/macOS treat paths
    /// case-insensitively) and must match exactly one non-deleted model — an ambiguous
    /// match refuses the save rather than guessing which model to overwrite.
    /// </summary>
    private async Task<ModelPathResolution> ResolveModelInfoFromPathAsync(IServiceProvider sp, string requestPath)
    {
        // Normalize path: strip prefix and decode segments
        var path = requestPath;
        var prefix = _pathPrefix.TrimEnd('/');
        if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            path = path[prefix.Length..];

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries)
                           .Select(Uri.UnescapeDataString)
                           .ToArray();

        string? projectName = null;
        string? modelSegment = null;

        // Project-based path: Projects / {ProjectName} / Models / {ModelName} / generated-/uploaded-{modelName}.blend@
        if (segments.Length >= 5 &&
            segments[0].Equals("Projects", StringComparison.OrdinalIgnoreCase) &&
            segments[2].Equals("Models", StringComparison.OrdinalIgnoreCase))
        {
            projectName = segments[1];
            modelSegment = segments[3];
        }
        // Global model path: Models / {ModelName} / generated-/uploaded-{modelName}.blend@
        else if (segments.Length >= 3 &&
                 segments[0].Equals("Models", StringComparison.OrdinalIgnoreCase))
        {
            modelSegment = segments[1];
        }
        else
        {
            _logger.LogWarning("ResolveModelInfo: unrecognized path structure: {Segments}", string.Join("/", segments));
            return ModelPathResolution.NotFound;
        }

        _logger.LogInformation("ResolveModelInfo: project={Project}, model={Model}", projectName ?? "(global)", modelSegment);

        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        var baseQuery = dbContext.Set<Domain.Models.Model>()
            .AsNoTracking()
            .Where(m => !m.IsDeleted);

        // Case-insensitive for the same reason as the model name below — Windows/macOS
        // WebDAV clients treat paths case-insensitively. Projects don't get an id-suffix
        // disambiguation UI (their own creation-time check is still case-sensitive), so
        // this stays a simple case-insensitive filter rather than a full ambiguity guard.
        if (projectName != null)
            baseQuery = baseQuery.Where(m => m.Projects.Any(p => p.Name.ToLower() == projectName.ToLower()));

        Domain.Models.Model? model = null;

        // 1. "{name} [{id}]" suffix — resolve directly by id if the name still matches.
        if (WebDavUtilities.TryParseIdSuffix(modelSegment!, out var suffixBaseName, out var suffixId))
        {
            var byId = await baseQuery
                .Where(m => m.Id == suffixId)
                .Include(m => m.Versions)
                    .ThenInclude(v => v.Files)
                .AsSplitQuery()
                .FirstOrDefaultAsync();

            if (byId != null && string.Equals(byId.Name, suffixBaseName, StringComparison.OrdinalIgnoreCase))
                model = byId;
        }

        // 2. Plain-name fallback, case-insensitive. Duplicate names are allowed by policy
        // now, so this must never guess: exactly one match resolves, anything else refuses.
        if (model == null)
        {
            var matches = await baseQuery
                .Where(m => m.Name.ToLower() == modelSegment!.ToLower())
                .Select(m => m.Id)
                .Take(2)
                .ToListAsync();

            if (matches.Count > 1)
            {
                _logger.LogWarning("ResolveModelInfo: ambiguous model name '{Model}' (2+ matches)", modelSegment);
                return new ModelPathResolution(null, Ambiguous: true, CandidateModelIds: matches);
            }

            if (matches.Count == 1)
            {
                model = await dbContext.Set<Domain.Models.Model>()
                    .AsNoTracking()
                    .Where(m => m.Id == matches[0])
                    .Include(m => m.Versions)
                        .ThenInclude(v => v.Files)
                    .AsSplitQuery()
                    .FirstOrDefaultAsync();
            }
        }

        if (model == null)
        {
            _logger.LogWarning("ResolveModelInfo: model '{Model}' not found", modelSegment);
            return ModelPathResolution.NotFound;
        }

        var newestVersion = model.Versions
            .Where(v => !v.IsDeleted)
            .OrderByDescending(v => v.VersionNumber)
            .FirstOrDefault();

        if (newestVersion == null)
        {
            _logger.LogWarning("ResolveModelInfo: no versions for model {ModelId}", model.Id);
            return ModelPathResolution.NotFound;
        }

        var blendFile = newestVersion.Files
            .FirstOrDefault(f => f.OriginalFileName.EndsWith(".blend", StringComparison.OrdinalIgnoreCase));

        return new ModelPathResolution((model.Id, model.Name, blendFile?.Sha256Hash), Ambiguous: false, CandidateModelIds: null);
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
