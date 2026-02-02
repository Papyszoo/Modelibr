using Application.Abstractions.Storage;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Props;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Represents a virtual asset file that streams from the hash-based storage.
/// </summary>
public sealed class VirtualAssetFile : IStoreItem
{
    private readonly IUploadPathProvider _pathProvider;

    public VirtualAssetFile(
        VirtualItemPropertyManager propertyManager,
        ILockingManager lockingManager,
        string name,
        string sha256Hash,
        long sizeBytes,
        string mimeType,
        DateTime createdAt,
        DateTime updatedAt,
        IUploadPathProvider pathProvider)
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

    private string GetPhysicalPath()
    {
        // Hash-based storage: root/aa/bb/hash
        var hash = Sha256Hash.ToLowerInvariant();
        var a = hash[..2];
        var b = hash.Substring(2, 2);
        return Path.Combine(_pathProvider.UploadRootPath, a, b, hash);
    }
}
