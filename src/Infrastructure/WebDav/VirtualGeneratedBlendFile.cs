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
public sealed class VirtualGeneratedBlendFile : IStoreItem
{
    private static readonly VirtualGeneratedBlendPropertyManager s_propertyManager = new();

    private readonly IBlendFileGenerator _generator;
    private readonly int _modelId;
    private readonly int _versionId;
    private readonly long _approximateSizeBytes;
    private readonly ILogger _logger;

    public VirtualGeneratedBlendFile(
        ILockingManager lockingManager,
        string name,
        long approximateSizeBytes,
        DateTime createdAt,
        DateTime updatedAt,
        IBlendFileGenerator generator,
        int modelId,
        int versionId,
        ILogger logger)
    {
        LockingManager = lockingManager;
        Name = name;
        _approximateSizeBytes = approximateSizeBytes;
        MimeType = "application/x-blender";
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        _generator = generator;
        _modelId = modelId;
        _versionId = versionId;
        _logger = logger;
    }

    public string Name { get; }
    public string UniqueKey => $"generated-blend:{_modelId}:v{_versionId}";
    public long SizeBytes => _generator.GetCachedSizeBytes(_modelId, _versionId) ?? _approximateSizeBytes;
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
                _logger.LogWarning("Generated .blend file not found: {Path}", result.FilePath);
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
