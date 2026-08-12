using Application.Abstractions.Services;
using Microsoft.Extensions.Logging;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Props;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Virtual file that lazily generates a .blend file from a renderable model file
/// with material preset textures applied via Blender CLI.
/// The generated file is cached on disk for subsequent reads.
/// </summary>
public sealed class VirtualGeneratedBlendFile : IStoreItem, IVirtualFileMetadata
{
    private static readonly VirtualGeneratedBlendPropertyManager s_propertyManager = new();

    private readonly IBlendFileGenerator _generator;
    private readonly int _modelId;
    private readonly int _versionId;
    private readonly ILogger _logger;

    public VirtualGeneratedBlendFile(
        ILockingManager lockingManager,
        string name,
        DateTime createdAt,
        DateTime updatedAt,
        IBlendFileGenerator generator,
        int modelId,
        int versionId,
        ILogger logger)
    {
        LockingManager = lockingManager;
        Name = name;
        MimeType = "application/x-blender";
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        _generator = generator;
        _modelId = modelId;
        _versionId = versionId;
        _logger = logger;
    }

    /// <summary>
    /// Readiness gate: generated-{name}.blend is only ever exposed to a WebDAV client
    /// (listing or single-item resolution) once the background generator has actually
    /// produced a cached file for this exact (modelId, versionId). Before that, PROPFIND/
    /// HEAD would have to report SOME size - and the only one available (the source
    /// renderable file's) is a lie the GET response can't back up. Clients that trust
    /// PROPFIND size for bounded reads (e.g. macOS WebDAVFS) then truncate the real .blend
    /// mid-copy, corrupting it. Returns null (never expose) when Blender is unavailable,
    /// there's no renderable file yet, or the cache is simply cold - GetOrGenerateAsync in
    /// GetReadableStreamAsync still covers a direct GET-by-URL for the cold-cache case.
    /// </summary>
    public static VirtualGeneratedBlendFile? TryCreate(
        ILockingManager lockingManager,
        Domain.Models.Model model,
        Domain.Models.ModelVersion newestVersion,
        IBlendFileGenerator generator,
        ILogger logger)
    {
        if (!generator.IsAvailable)
            return null;

        var renderableFile = newestVersion.Files.FirstOrDefault(f => f.FileType.IsRenderable);
        if (renderableFile == null)
            return null;

        if (generator.GetCachedSizeBytes(model.Id, newestVersion.Id) == null)
            return null;

        return new VirtualGeneratedBlendFile(
            lockingManager,
            $"generated-{model.Name}.blend",
            renderableFile.CreatedAt,
            renderableFile.UpdatedAt,
            generator,
            model.Id,
            newestVersion.Id,
            logger);
    }

    public string Name { get; }
    public string UniqueKey => $"generated-blend:{_modelId}:v{_versionId}";

    // Now that TryCreate only ever hands out an instance once the cache is confirmed
    // present, this is always the truthful on-disk size - never the source file's
    // approximate size (that lie is exactly what corrupted the file on WebDAV clients
    // that truncate reads to the PROPFIND-reported length). The 0 fallback only matters
    // for the pathological race where the cache file is invalidated between TryCreate and
    // this getter; GetReadableStreamAsync regenerates it either way.
    public long SizeBytes => _generator.GetCachedSizeBytes(_modelId, _versionId) ?? 0;
    public string MimeType { get; }
    public DateTime CreatedAt { get; }
    public DateTime UpdatedAt { get; }
    public IPropertyManager PropertyManager => s_propertyManager;
    public ILockingManager LockingManager { get; }

    public async Task<Stream> GetReadableStreamAsync(IHttpContext httpContext)
    {
        try
        {
            var result = await _generator.GetOrGenerateAsync(_modelId, _versionId);
            if (result == null)
            {
                _logger.LogWarning("Failed to generate .blend for model {ModelId} version {VersionId}", _modelId, _versionId);
                return Stream.Null;
            }

            if (!File.Exists(result.FilePath))
            {
                // Unlike a normal generation failure (Blender unavailable, bad source
                // file - logged as a warning above), the generator reported success but
                // the output vanished before we could read it. That's the same class of
                // anomaly as a missing persisted blob (VirtualAssetFile), so it gets the
                // same Error level. Stream.Null still drives CustomWebDavHandler to 404,
                // never a bogus empty download.
                _logger.LogError("Generated .blend file not found: {Path}", result.FilePath);
                return Stream.Null;
            }

            return File.OpenRead(result.FilePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating .blend for model {ModelId} version {VersionId}", _modelId, _versionId);
            return Stream.Null;
        }
    }

    public Task<DavStatusCode> UploadFromStreamAsync(IHttpContext httpContext, Stream source)
    {
        return Task.FromResult(DavStatusCode.Forbidden);
    }

    public Task<StoreItemResult> CopyAsync(IStoreCollection destination, string name, bool overwrite, IHttpContext httpContext)
    {
        return Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));
    }
}
