using Application.Abstractions.Storage;
using Domain.Models;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Collection that lists all models under /Models (global view).
/// </summary>
public sealed class VirtualAllModelsCollection : VirtualCollectionBase
{
    private readonly List<Model> _models;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualAllModelsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        List<Model> models,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Models")
    {
        _models = models;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => "allmodels";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var model = _models.FirstOrDefault(m => !m.IsDeleted && m.Name == name);
        if (model == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualModelCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            model,
            _itemPropertyManager,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _models
            .Where(m => !m.IsDeleted)
            .Select(m => (IStoreItem)new VirtualModelCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                m,
                _itemPropertyManager,
                _pathProvider));

        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection that lists all texture sets under /TextureSets (global view).
/// </summary>
public sealed class VirtualAllTextureSetsCollection : VirtualCollectionBase
{
    private readonly List<TextureSet> _textureSets;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualAllTextureSetsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        List<TextureSet> textureSets,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "TextureSets")
    {
        _textureSets = textureSets;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => "alltexturesets";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var textureSet = _textureSets.FirstOrDefault(ts => !ts.IsDeleted && ts.Name == name);
        if (textureSet == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualTextureSetCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            textureSet,
            _itemPropertyManager,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _textureSets
            .Where(ts => !ts.IsDeleted)
            .Select(ts => (IStoreItem)new VirtualTextureSetCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                ts,
                _itemPropertyManager,
                _pathProvider));

        return Task.FromResult(items);
    }
}
