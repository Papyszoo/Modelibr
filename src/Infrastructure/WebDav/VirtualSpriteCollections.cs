using Application.Abstractions.Storage;
using Domain.Models;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Collection that lists all sprite categories under /Sprites, including "Unassigned".
/// </summary>
public sealed class VirtualSpriteCategoriesCollection : VirtualCollectionBase
{
    private readonly List<SpriteCategory> _categories;
    private readonly bool _hasUnassigned;

    public VirtualSpriteCategoriesCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        List<SpriteCategory> categories,
        bool hasUnassigned)
        : base(propertyManager, lockingManager, "Sprites")
    {
        _categories = categories;
        _hasUnassigned = hasUnassigned;
    }

    public override string UniqueKey => "spritecategories";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        if (name.Equals("Unassigned", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<IStoreItem?>(new VirtualUnassignedSpritesCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                new List<Sprite>(),
                null!,
                null!));
        }

        var category = _categories.FirstOrDefault(c => c.Name == name);
        if (category == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualSpriteCategoryCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            category,
            new List<Sprite>(),
            null!,
            null!));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = new List<IStoreItem>();

        // Add Unassigned folder first
        if (_hasUnassigned)
        {
            items.Add(new VirtualUnassignedSpritesCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                new List<Sprite>(),
                null!,
                null!));
        }

        // Add category folders
        items.AddRange(_categories.Select(c => (IStoreItem)new VirtualSpriteCategoryCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            c,
            new List<Sprite>(),
            null!,
            null!)));

        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }
}

/// <summary>
/// Collection that represents a single sprite category with its sprites.
/// </summary>
public sealed class VirtualSpriteCategoryCollection : VirtualCollectionBase
{
    private readonly SpriteCategory _category;
    private readonly List<Sprite> _sprites;
    private readonly VirtualItemPropertyManager? _itemPropertyManager;
    private readonly IUploadPathProvider? _pathProvider;

    public VirtualSpriteCategoryCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        SpriteCategory category,
        List<Sprite> sprites,
        VirtualItemPropertyManager? itemPropertyManager,
        IUploadPathProvider? pathProvider)
        : base(propertyManager, lockingManager, category.Name)
    {
        _category = category;
        _sprites = sprites;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"spritecategory:{_category.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        if (_itemPropertyManager == null || _pathProvider == null)
            return Task.FromResult<IStoreItem?>(null);

        var sprite = _sprites.FirstOrDefault(s => s.File.OriginalFileName == name);
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
        if (_itemPropertyManager == null || _pathProvider == null)
            return Task.FromResult<IEnumerable<IStoreItem>>(Array.Empty<IStoreItem>());

        var items = _sprites.Select(s => (IStoreItem)new VirtualAssetFile(
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
/// Collection that represents unassigned sprites (sprites without a category).
/// </summary>
public sealed class VirtualUnassignedSpritesCollection : VirtualCollectionBase
{
    private readonly List<Sprite> _sprites;
    private readonly VirtualItemPropertyManager? _itemPropertyManager;
    private readonly IUploadPathProvider? _pathProvider;

    public VirtualUnassignedSpritesCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        List<Sprite> sprites,
        VirtualItemPropertyManager? itemPropertyManager,
        IUploadPathProvider? pathProvider)
        : base(propertyManager, lockingManager, "Unassigned")
    {
        _sprites = sprites;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => "spritecategory:unassigned";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        if (_itemPropertyManager == null || _pathProvider == null)
            return Task.FromResult<IStoreItem?>(null);

        var sprite = _sprites.FirstOrDefault(s => s.File.OriginalFileName == name);
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
        if (_itemPropertyManager == null || _pathProvider == null)
            return Task.FromResult<IEnumerable<IStoreItem>>(Array.Empty<IStoreItem>());

        var items = _sprites.Select(s => (IStoreItem)new VirtualAssetFile(
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
