using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Props;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Base class for virtual collections in the WebDAV virtual file system.
/// </summary>
public abstract class VirtualCollectionBase : IStoreCollection
{
    protected VirtualCollectionBase(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, string name)
    {
        PropertyManager = propertyManager;
        LockingManager = lockingManager;
        Name = name;
    }

    public string Name { get; }
    public abstract string UniqueKey { get; }
    public IPropertyManager PropertyManager { get; }
    public ILockingManager LockingManager { get; }

    public abstract Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext);
    public abstract Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext);

    // Collections don't have readable streams
    public Task<Stream> GetReadableStreamAsync(IHttpContext httpContext)
        => Task.FromResult(Stream.Null);

    public Task<DavStatusCode> UploadFromStreamAsync(IHttpContext httpContext, Stream source)
        => Task.FromResult(DavStatusCode.Forbidden);

    // Read-only virtual file system - no modifications allowed
    public Task<StoreItemResult> CreateItemAsync(string name, bool overwrite, IHttpContext httpContext)
        => Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));

    public Task<StoreCollectionResult> CreateCollectionAsync(string name, bool overwrite, IHttpContext httpContext)
        => Task.FromResult(new StoreCollectionResult(DavStatusCode.Forbidden));

    public Task<StoreItemResult> CopyAsync(IStoreCollection destination, string name, bool overwrite, IHttpContext httpContext)
        => Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));

    public bool SupportsFastMove(IStoreCollection destination, string destinationName, bool overwrite, IHttpContext httpContext)
        => false;

    public Task<StoreItemResult> MoveItemAsync(string sourceName, IStoreCollection destination, string destinationName, bool overwrite, IHttpContext httpContext)
        => Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));

    public Task<DavStatusCode> DeleteItemAsync(string name, IHttpContext httpContext)
        => Task.FromResult(DavStatusCode.Forbidden);

    public InfiniteDepthMode InfiniteDepthMode => InfiniteDepthMode.Assume1;
}
