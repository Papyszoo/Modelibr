using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Models;
using Microsoft.Extensions.Logging;
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
    private readonly IBlendFileGenerator? _blendFileGenerator;
    private readonly ILogger? _logger;

    public VirtualAllModelsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        List<Model> models,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider,
        IBlendFileGenerator? blendFileGenerator = null,
        ILogger? logger = null)
        : base(propertyManager, lockingManager, "Models")
    {
        _models = models;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
        _blendFileGenerator = blendFileGenerator;
        _logger = logger;
    }

    public override string UniqueKey => "allmodels";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var siblings = _models.Where(m => !m.IsDeleted).ToList();
        var model = WebDavUtilities.ResolveSegment(name, siblings, m => m.Id, m => m.Name);
        if (model == null)
            return Task.FromResult<IStoreItem?>(null);

        var displayNames = WebDavUtilities.ComputeDisplayNames(siblings, m => m.Id, m => m.Name);

        return Task.FromResult<IStoreItem?>(new VirtualModelCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            model,
            _itemPropertyManager,
            _pathProvider,
            _blendFileGenerator,
            _logger,
            displayNames[model.Id]));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var siblings = _models.Where(m => !m.IsDeleted).ToList();
        var displayNames = WebDavUtilities.ComputeDisplayNames(siblings, m => m.Id, m => m.Name);

        var items = siblings
            .Select(m => (IStoreItem)new VirtualModelCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                m,
                _itemPropertyManager,
                _pathProvider,
                _blendFileGenerator,
                _logger,
                displayNames[m.Id]));

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
        var siblings = _textureSets.Where(ts => !ts.IsDeleted).ToList();
        var textureSet = WebDavUtilities.ResolveSegment(name, siblings, ts => ts.Id, ts => ts.Name);
        if (textureSet == null)
            return Task.FromResult<IStoreItem?>(null);

        var displayNames = WebDavUtilities.ComputeDisplayNames(siblings, ts => ts.Id, ts => ts.Name);

        return Task.FromResult<IStoreItem?>(new VirtualTextureSetCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            textureSet,
            _itemPropertyManager,
            _pathProvider,
            displayNames[textureSet.Id]));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var siblings = _textureSets.Where(ts => !ts.IsDeleted).ToList();
        var displayNames = WebDavUtilities.ComputeDisplayNames(siblings, ts => ts.Id, ts => ts.Name);

        var items = siblings
            .Select(ts => (IStoreItem)new VirtualTextureSetCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                ts,
                _itemPropertyManager,
                _pathProvider,
                displayNames[ts.Id]));

        return Task.FromResult(items);
    }
}
