using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Models;
using Microsoft.Extensions.Logging;
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
        // Packs have their own (case-sensitive, DB-enforced-at-creation-time) uniqueness
        // check and are not disambiguated with an id suffix — but WebDAV clients on
        // Windows/macOS address paths case-insensitively, so a case-only collision must
        // never be guessed at: resolve unambiguously or 404.
        var pack = WebDavUtilities.ResolveSegment(name, _packs, p => p.Id, p => p.Name);
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
            new VirtualCategoryCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "EnvironmentMaps", $"pack:{_pack.Id}:environmentmaps"),
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
    private readonly IBlendFileGenerator? _blendFileGenerator;
    private readonly ILogger? _logger;

    public VirtualPackModelsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Pack pack,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider,
        IBlendFileGenerator? blendFileGenerator = null,
        ILogger? logger = null)
        : base(propertyManager, lockingManager, "Models")
    {
        _pack = pack;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
        _blendFileGenerator = blendFileGenerator;
        _logger = logger;
    }

    public override string UniqueKey => $"pack:{_pack.Id}:models";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var siblings = _pack.Models.Where(m => !m.IsDeleted).ToList();
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
        var siblings = _pack.Models.Where(m => !m.IsDeleted).ToList();
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
        var siblings = _pack.TextureSets.Where(ts => !ts.IsDeleted).ToList();
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
        var siblings = _pack.TextureSets.Where(ts => !ts.IsDeleted).ToList();
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
        var siblings = _pack.Sprites.Where(s => !s.IsDeleted).ToList();
        var sprite = WebDavUtilities.ResolveSegment(name, siblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));
        if (sprite == null)
            return Task.FromResult<IStoreItem?>(null);

        var displayNames = ComputeSpriteFileNames(siblings);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            displayNames[sprite.Id],
            sprite.File.Sha256Hash,
            sprite.File.SizeBytes,
            sprite.File.MimeType,
            sprite.File.CreatedAt,
            sprite.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var siblings = _pack.Sprites.Where(s => !s.IsDeleted).ToList();
        var displayNames = ComputeSpriteFileNames(siblings);

        var items = siblings
            .Select(s => (IStoreItem)new VirtualAssetFile(
                _itemPropertyManager,
                LockingManager,
                displayNames[s.Id],
                s.File.Sha256Hash,
                s.File.SizeBytes,
                s.File.MimeType,
                s.File.CreatedAt,
                s.File.UpdatedAt,
                _pathProvider));

        return Task.FromResult(items);
    }

    private static IReadOnlyDictionary<int, string> ComputeSpriteFileNames(List<Sprite> siblings)
    {
        var names = WebDavUtilities.ComputeDisplayNames(siblings, s => s.Id, s => s.Name);
        return siblings.ToDictionary(s => s.Id, s => WebDavUtilities.GetVirtualFileName(names[s.Id], s.File.OriginalFileName));
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
        var siblings = _pack.Sounds.Where(s => !s.IsDeleted).ToList();
        var sound = WebDavUtilities.ResolveSegment(name, siblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));
        if (sound == null)
            return Task.FromResult<IStoreItem?>(null);

        var displayNames = ComputeSoundFileNames(siblings);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            displayNames[sound.Id],
            sound.File.Sha256Hash,
            sound.File.SizeBytes,
            sound.File.MimeType,
            sound.File.CreatedAt,
            sound.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var siblings = _pack.Sounds.Where(s => !s.IsDeleted).ToList();
        var displayNames = ComputeSoundFileNames(siblings);

        var items = siblings
            .Select(s => (IStoreItem)new VirtualAssetFile(
                _itemPropertyManager,
                LockingManager,
                displayNames[s.Id],
                s.File.Sha256Hash,
                s.File.SizeBytes,
                s.File.MimeType,
                s.File.CreatedAt,
                s.File.UpdatedAt,
                _pathProvider));

        return Task.FromResult(items);
    }

    private static IReadOnlyDictionary<int, string> ComputeSoundFileNames(List<Sound> siblings)
    {
        var names = WebDavUtilities.ComputeDisplayNames(siblings, s => s.Id, s => s.Name);
        return siblings.ToDictionary(s => s.Id, s => WebDavUtilities.GetVirtualFileName(names[s.Id], s.File.OriginalFileName));
    }
}
