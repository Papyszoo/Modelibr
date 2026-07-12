using Application.Abstractions.Storage;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Props;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Represents a virtual asset file that streams from the hash-based storage.
/// </summary>
public sealed class VirtualAssetFile : IStoreItem, IVirtualFileMetadata
{
    private readonly IUploadPathProvider _pathProvider;
    private readonly string _relativePath;
    private readonly ILogger _logger;

    /// <param name="relativePath">
    /// The <c>File.FilePath</c> value persisted by <c>HashBasedFileStorage</c> (e.g.
    /// <c>"aa/bb/&lt;hash&gt;"</c>) — the single source of truth for where this asset's
    /// bytes live on disk. Never re-derived from <paramref name="sha256Hash"/> here; see
    /// item 4 of prompt 30.
    /// </param>
    /// <param name="logger">
    /// Optional: only threaded through by callers that resolve a single named file
    /// directly (the real GET/HEAD path, in <see cref="VirtualAssetStore"/>). Collection
    /// listings that construct these purely for PROPFIND enumeration never call
    /// <see cref="GetReadableStreamAsync"/>, so they pass no logger and this class falls
    /// back to a no-op logger rather than forcing a logger through every listing call site.
    /// </param>
    public VirtualAssetFile(
        VirtualItemPropertyManager propertyManager,
        ILockingManager lockingManager,
        string name,
        string sha256Hash,
        string relativePath,
        long sizeBytes,
        string mimeType,
        DateTime createdAt,
        DateTime updatedAt,
        IUploadPathProvider pathProvider,
        ILogger? logger = null)
    {
        PropertyManager = propertyManager;
        LockingManager = lockingManager;
        Name = name;
        Sha256Hash = sha256Hash;
        SizeBytes = sizeBytes;
        MimeType = mimeType;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        _pathProvider = pathProvider;
        _relativePath = relativePath;
        _logger = logger ?? NullLogger.Instance;
    }

    public string Name { get; }
    public string UniqueKey => $"asset:{Sha256Hash}";
    public string Sha256Hash { get; }
    public long SizeBytes { get; }
    public string MimeType { get; }
    public DateTime CreatedAt { get; }
    public DateTime UpdatedAt { get; }
    public IPropertyManager PropertyManager { get; }
    public ILockingManager LockingManager { get; }

    public Task<Stream> GetReadableStreamAsync(IHttpContext httpContext)
    {
        var physicalPath = GetPhysicalPath();

        if (!File.Exists(physicalPath))
        {
            // A physical blob missing for a File row that's actually referenced by a
            // model/texture/sprite/sound is a data-safety event, not a routine 404 — log
            // it loudly. Returning Stream.Null (rather than an empty/zero-length stream
            // written to the response) is what makes this a 404 instead of a bogus 0-byte
            // download: CustomWebDavHandler.WriteFileAsync checks
            // ReferenceEquals(stream, Stream.Null) and sets response.Status = 404 before
            // ever touching the response body. NWebDav's own GET handler is never reached
            // for this store — CustomWebDavHandler fully replaces it (see
            // RequestHandlerFactory) — so this Stream.Null contract is the only mechanism
            // that matters here.
            _logger.LogError(
                "Missing physical blob for asset {Name} (hash {Hash}): expected at {ExpectedPath}",
                Name, Sha256Hash, physicalPath);
            return Task.FromResult(Stream.Null);
        }

        return Task.FromResult<Stream>(File.OpenRead(physicalPath));
    }

    public Task<DavStatusCode> UploadFromStreamAsync(IHttpContext httpContext, Stream source)
    {
        // Read-only virtual file system
        return Task.FromResult(DavStatusCode.Forbidden);
    }

    public Task<StoreItemResult> CopyAsync(IStoreCollection destination, string name, bool overwrite, IHttpContext httpContext)
    {
        // Read-only virtual file system
        return Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));
    }

    private string GetPhysicalPath() => Path.Combine(_pathProvider.UploadRootPath, _relativePath);
}
