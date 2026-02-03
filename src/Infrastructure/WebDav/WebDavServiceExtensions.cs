using System.Xml.Linq;
using Microsoft.Extensions.DependencyInjection;
using NWebDav.Server;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Extension methods for registering WebDAV services.
/// </summary>
public static class WebDavServiceExtensions
{
    /// <summary>
    /// Adds WebDAV virtual asset store services to the service collection.
    /// </summary>
    public static IServiceCollection AddVirtualAssetStore(this IServiceCollection services)
    {
        // Register locking manager (no-op for read-only)
        services.AddSingleton<NoLockingManager>();
        services.AddSingleton<ILockingManager>(sp => sp.GetRequiredService<NoLockingManager>());

        // Register property managers
        services.AddSingleton<VirtualItemPropertyManager>();
        services.AddSingleton<VirtualCollectionPropertyManager>();

        // Register the virtual asset store
        services.AddSingleton<VirtualAssetStore>();
        services.AddSingleton<IStore>(sp => sp.GetRequiredService<VirtualAssetStore>());

        return services;
    }
}

/// <summary>
/// No-op locking manager for read-only virtual file system.
/// </summary>
public sealed class NoLockingManager : ILockingManager
{
    public LockResult Lock(IStoreItem item, LockType lockType, LockScope lockScope, XElement owner, Uri lockRootUri, bool recursiveLock, IEnumerable<int> timeouts)
    {
        return new LockResult(DavStatusCode.Forbidden);
    }

    public DavStatusCode Unlock(IStoreItem item, Uri token)
    {
        return DavStatusCode.NoContent;
    }

    public LockResult RefreshLock(IStoreItem item, bool recursiveLock, IEnumerable<int> timeouts, Uri lockTokenUri)
    {
        return new LockResult(DavStatusCode.PreconditionFailed);
    }

    public IEnumerable<ActiveLock> GetActiveLockInfo(IStoreItem item)
    {
        return Enumerable.Empty<ActiveLock>();
    }

    public IEnumerable<LockEntry> GetSupportedLocks(IStoreItem item)
    {
        return Enumerable.Empty<LockEntry>();
    }

    public bool IsLocked(IStoreItem item)
    {
        return false;
    }

    public bool HasLock(IStoreItem item, Uri lockToken)
    {
        return false;
    }
}
