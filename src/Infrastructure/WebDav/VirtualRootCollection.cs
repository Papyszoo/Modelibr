using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Root collection that exposes the top-level virtual directories: Projects, Sounds, and Selection.
/// </summary>
public sealed class VirtualRootCollection : VirtualCollectionBase
{
    private readonly VirtualAssetStore _store;

    public VirtualRootCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, VirtualAssetStore store)
        : base(propertyManager, lockingManager, "")
    {
        _store = store;
    }

    public override string UniqueKey => "root";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        return name.ToLowerInvariant() switch
        {
            "projects" => Task.FromResult<IStoreItem?>(new VirtualCategoryCollection(_store.CollectionPropertyManager, _store.LockingManager, "Projects", "projects")),
            "sounds" => Task.FromResult<IStoreItem?>(new VirtualCategoryCollection(_store.CollectionPropertyManager, _store.LockingManager, "Sounds", "sounds")),
            "selection" => Task.FromResult<IStoreItem?>(new VirtualCategoryCollection(_store.CollectionPropertyManager, _store.LockingManager, "Selection", "selection")),
            _ => Task.FromResult<IStoreItem?>(null)
        };
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = new List<IStoreItem>
        {
            new VirtualCategoryCollection(_store.CollectionPropertyManager, _store.LockingManager, "Projects", "projects"),
            new VirtualCategoryCollection(_store.CollectionPropertyManager, _store.LockingManager, "Sounds", "sounds"),
            new VirtualCategoryCollection(_store.CollectionPropertyManager, _store.LockingManager, "Selection", "selection")
        };
        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }
}

/// <summary>
/// Represents a top-level category folder (Projects or Sounds).
/// </summary>
public sealed class VirtualCategoryCollection : VirtualCollectionBase
{
    private readonly string _key;

    public VirtualCategoryCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, string name, string key)
        : base(propertyManager, lockingManager, name)
    {
        _key = key;
    }

    public override string UniqueKey => $"category:{_key}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        // This is a placeholder - actual resolution is handled by the store
        return Task.FromResult<IStoreItem?>(null);
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        // This is a placeholder - actual items are resolved by the store
        return Task.FromResult<IEnumerable<IStoreItem>>(Array.Empty<IStoreItem>());
    }
}
