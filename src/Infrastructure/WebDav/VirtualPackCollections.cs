using Application.Abstractions.Storage;
using Domain.Models;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Collection that lists all packs under /Packs.
/// </summary>
public sealed class VirtualPacksCollection : VirtualCollectionBase
{
    private readonly List<Pack> _packs;

    public VirtualPacksCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, List<Pack> packs)
        : base(propertyManager, lockingManager, "Packs")
    {
        _packs = packs;
    }

    public override string UniqueKey => "packs";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var pack = _packs.FirstOrDefault(p => p.Name == name);
        if (pack == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualPackCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, pack));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _packs.Select(p => (IStoreItem)new VirtualPackCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, p));
        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection that represents a single pack with asset type subfolders.
/// </summary>
public sealed class VirtualPackCollection : VirtualCollectionBase
{
    private readonly Pack _pack;

    public VirtualPackCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Pack pack)
        : base(propertyManager, lockingManager, pack.Name)
    {
        _pack = pack;
    }

    public override string UniqueKey => $"pack:{_pack.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        return Task.FromResult<IStoreItem?>(null);
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = new List<IStoreItem>
        {
            new VirtualCategoryCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "Models", $"pack:{_pack.Id}:models"),
            new VirtualCategoryCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "TextureSets", $"pack:{_pack.Id}:texturesets"),
            new VirtualCategoryCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "Sprites", $"pack:{_pack.Id}:sprites"),
            new VirtualCategoryCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "Sounds", $"pack:{_pack.Id}:sounds")
        };
        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }
}

/// <summary>
/// Collection that lists all models in a pack under /Packs/{PackName}/Models.
/// </summary>
public sealed class VirtualPackModelsCollection : VirtualCollectionBase
{
    private readonly Pack _pack;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualPackModelsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Pack pack,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Models")
    {
        _pack = pack;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"pack:{_pack.Id}:models";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var model = _pack.Models.FirstOrDefault(m => !m.IsDeleted && m.Name == name);
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
        var items = _pack.Models
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
/// Collection that lists all texture sets in a pack under /Packs/{PackName}/TextureSets.
/// </summary>
public sealed class VirtualPackTextureSetsCollection : VirtualCollectionBase
{
    private readonly Pack _pack;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualPackTextureSetsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Pack pack,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "TextureSets")
    {
        _pack = pack;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"pack:{_pack.Id}:texturesets";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var textureSet = _pack.TextureSets.FirstOrDefault(ts => !ts.IsDeleted && ts.Name == name);
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
        var items = _pack.TextureSets
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

/// <summary>
/// Collection that lists all sprites in a pack under /Packs/{PackName}/Sprites.
/// </summary>
public sealed class VirtualPackSpritesCollection : VirtualCollectionBase
{
    private readonly Pack _pack;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualPackSpritesCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Pack pack,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Sprites")
    {
        _pack = pack;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"pack:{_pack.Id}:sprites";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var sprite = _pack.Sprites.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == name);
        if (sprite == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            sprite.File.OriginalFileName,
            sprite.File.Sha256Hash,
            sprite.File.SizeBytes,
            sprite.File.MimeType,
            sprite.File.CreatedAt,
            sprite.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _pack.Sprites
            .Where(s => !s.IsDeleted)
            .Select(s => (IStoreItem)new VirtualAssetFile(
                _itemPropertyManager,
                LockingManager,
                s.File.OriginalFileName,
                s.File.Sha256Hash,
                s.File.SizeBytes,
                s.File.MimeType,
                s.File.CreatedAt,
                s.File.UpdatedAt,
                _pathProvider));

        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection that lists all sounds in a pack under /Packs/{PackName}/Sounds.
/// </summary>
public sealed class VirtualPackSoundsCollection : VirtualCollectionBase
{
    private readonly Pack _pack;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualPackSoundsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Pack pack,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Sounds")
    {
        _pack = pack;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"pack:{_pack.Id}:sounds";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var sound = _pack.Sounds.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == name);
        if (sound == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            sound.File.OriginalFileName,
            sound.File.Sha256Hash,
            sound.File.SizeBytes,
            sound.File.MimeType,
            sound.File.CreatedAt,
            sound.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _pack.Sounds
            .Where(s => !s.IsDeleted)
            .Select(s => (IStoreItem)new VirtualAssetFile(
                _itemPropertyManager,
                LockingManager,
                s.File.OriginalFileName,
                s.File.Sha256Hash,
                s.File.SizeBytes,
                s.File.MimeType,
                s.File.CreatedAt,
                s.File.UpdatedAt,
                _pathProvider));

        return Task.FromResult(items);
    }
}
