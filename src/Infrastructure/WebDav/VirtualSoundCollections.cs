using Application.Abstractions.Storage;
using Domain.Models;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Collection that lists all sound categories under /Sounds.
/// </summary>
public sealed class VirtualSoundCategoriesCollection : VirtualCollectionBase
{
    private readonly List<SoundCategory> _categories;

    public VirtualSoundCategoriesCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, List<SoundCategory> categories)
        : base(propertyManager, lockingManager, "Sounds")
    {
        _categories = categories;
    }

    public override string UniqueKey => "soundcategories";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var category = _categories.FirstOrDefault(c => c.Name == name);
        if (category == null)
            return Task.FromResult<IStoreItem?>(null);

        // Placeholder - actual sounds need to be resolved by the store
        return Task.FromResult<IStoreItem?>(new VirtualSoundCategoryCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            category,
            new List<Sound>(),
            null!,
            null!));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _categories.Select(c => (IStoreItem)new VirtualSoundCategoryCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            c,
            new List<Sound>(),
            null!,
            null!));
        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection that represents a single sound category with its sounds.
/// </summary>
public sealed class VirtualSoundCategoryCollection : VirtualCollectionBase
{
    private readonly SoundCategory _category;
    private readonly List<Sound> _sounds;
    private readonly VirtualItemPropertyManager? _itemPropertyManager;
    private readonly IUploadPathProvider? _pathProvider;

    public VirtualSoundCategoryCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        SoundCategory category,
        List<Sound> sounds,
        VirtualItemPropertyManager? itemPropertyManager,
        IUploadPathProvider? pathProvider)
        : base(propertyManager, lockingManager, category.Name)
    {
        _category = category;
        _sounds = sounds;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"soundcategory:{_category.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        if (_itemPropertyManager == null || _pathProvider == null)
            return Task.FromResult<IStoreItem?>(null);

        var sound = _sounds.FirstOrDefault(s => s.File.OriginalFileName == name);
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
        if (_itemPropertyManager == null || _pathProvider == null)
            return Task.FromResult<IEnumerable<IStoreItem>>(Array.Empty<IStoreItem>());

        var items = _sounds.Select(s => (IStoreItem)new VirtualAssetFile(
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
