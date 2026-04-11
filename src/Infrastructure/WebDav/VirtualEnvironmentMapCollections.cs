using Application.Abstractions.Storage;
using Domain.Models;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;
using DomainFile = Domain.Models.File;

namespace Infrastructure.WebDav;

public sealed class VirtualAllEnvironmentMapsCollection : VirtualCollectionBase
{
    private readonly List<EnvironmentMap> _environmentMaps;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualAllEnvironmentMapsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        List<EnvironmentMap> environmentMaps,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "EnvironmentMaps")
    {
        _environmentMaps = environmentMaps;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => "allenvironmentmaps";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var environmentMap = _environmentMaps.FirstOrDefault(e => !e.IsDeleted && e.Name == name);
        if (environmentMap == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualEnvironmentMapCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            environmentMap,
            _itemPropertyManager,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _environmentMaps
            .Where(e => !e.IsDeleted)
            .Select(e => (IStoreItem)new VirtualEnvironmentMapCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                e,
                _itemPropertyManager,
                _pathProvider));

        return Task.FromResult(items);
    }
}

public sealed class VirtualEnvironmentMapCollection : VirtualCollectionBase
{
    private readonly EnvironmentMap _environmentMap;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualEnvironmentMapCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        EnvironmentMap environmentMap,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, environmentMap.Name)
    {
        _environmentMap = environmentMap;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"environmentmap:{_environmentMap.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        return name.ToLowerInvariant() switch
        {
            "variants" => Task.FromResult<IStoreItem?>(new VirtualEnvironmentMapVariantsCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, _environmentMap, _itemPropertyManager, _pathProvider)),
            "files" => Task.FromResult<IStoreItem?>(new VirtualEnvironmentMapFilesCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, _environmentMap, _itemPropertyManager, _pathProvider)),
            _ => Task.FromResult<IStoreItem?>(null)
        };
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        return Task.FromResult<IEnumerable<IStoreItem>>(
        [
            new VirtualEnvironmentMapVariantsCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, _environmentMap, _itemPropertyManager, _pathProvider),
            new VirtualEnvironmentMapFilesCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, _environmentMap, _itemPropertyManager, _pathProvider)
        ]);
    }
}

public sealed class VirtualEnvironmentMapVariantsCollection : VirtualCollectionBase
{
    private readonly EnvironmentMap _environmentMap;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualEnvironmentMapVariantsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        EnvironmentMap environmentMap,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Variants")
    {
        _environmentMap = environmentMap;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"environmentmap:{_environmentMap.Id}:variants";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var variantFile = _environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .SelectMany(EnvironmentMapWebDavNaming.GetVariantFiles)
            .FirstOrDefault(v => v.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

        return Task.FromResult<IStoreItem?>(variantFile.File == null ? null : CreateAssetFile(variantFile.File, name));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .SelectMany(EnvironmentMapWebDavNaming.GetVariantFiles)
            .Select(v => (IStoreItem)CreateAssetFile(v.File, v.Name));

        return Task.FromResult(items);
    }

    private VirtualAssetFile CreateAssetFile(DomainFile file, string name)
        => new(
            _itemPropertyManager,
            LockingManager,
            name,
            file.Sha256Hash,
            file.SizeBytes,
            file.MimeType,
            file.CreatedAt,
            file.UpdatedAt,
            _pathProvider);
}

public sealed class VirtualEnvironmentMapFilesCollection : VirtualCollectionBase
{
    private readonly EnvironmentMap _environmentMap;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualEnvironmentMapFilesCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        EnvironmentMap environmentMap,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Files")
    {
        _environmentMap = environmentMap;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"environmentmap:{_environmentMap.Id}:files";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var file = _environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .SelectMany(EnvironmentMapWebDavNaming.GetOriginalFiles)
            .FirstOrDefault(v => v.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
            .File;

        return Task.FromResult<IStoreItem?>(file == null ? null : CreateAssetFile(file));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .SelectMany(EnvironmentMapWebDavNaming.GetOriginalFiles)
            .Select(v => (IStoreItem)CreateAssetFile(v.File));

        return Task.FromResult(items);
    }

    private VirtualAssetFile CreateAssetFile(DomainFile file)
        => new(
            _itemPropertyManager,
            LockingManager,
            file.OriginalFileName,
            file.Sha256Hash,
            file.SizeBytes,
            file.MimeType,
            file.CreatedAt,
            file.UpdatedAt,
            _pathProvider);
}

public sealed class VirtualPackEnvironmentMapsCollection : VirtualCollectionBase
{
    private readonly Pack _pack;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualPackEnvironmentMapsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Pack pack,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "EnvironmentMaps")
    {
        _pack = pack;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"pack:{_pack.Id}:environmentmaps";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var environmentMap = _pack.EnvironmentMaps.FirstOrDefault(e => !e.IsDeleted && e.Name == name);
        return Task.FromResult<IStoreItem?>(environmentMap == null ? null : new VirtualEnvironmentMapCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, environmentMap, _itemPropertyManager, _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _pack.EnvironmentMaps
            .Where(e => !e.IsDeleted)
            .Select(e => (IStoreItem)new VirtualEnvironmentMapCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, e, _itemPropertyManager, _pathProvider));
        return Task.FromResult(items);
    }
}

public sealed class VirtualProjectEnvironmentMapsCollection : VirtualCollectionBase
{
    private readonly Project _project;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualProjectEnvironmentMapsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Project project,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "EnvironmentMaps")
    {
        _project = project;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"project:{_project.Id}:environmentmaps";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var environmentMap = _project.EnvironmentMaps.FirstOrDefault(e => !e.IsDeleted && e.Name == name);
        return Task.FromResult<IStoreItem?>(environmentMap == null ? null : new VirtualEnvironmentMapCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, environmentMap, _itemPropertyManager, _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _project.EnvironmentMaps
            .Where(e => !e.IsDeleted)
            .Select(e => (IStoreItem)new VirtualEnvironmentMapCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, e, _itemPropertyManager, _pathProvider));
        return Task.FromResult(items);
    }
}

internal static class EnvironmentMapWebDavNaming
{
    internal static IEnumerable<(string Name, DomainFile File)> GetVariantFiles(EnvironmentMapVariant variant)
    {
        if (variant.IsPanoramic && variant.File != null)
        {
            yield return ($"{variant.SizeLabel}.{WebDavUtilities.GetExtension(variant.File.OriginalFileName)}", variant.File);
            yield break;
        }

        foreach (var faceFile in variant.GetOrderedFaceFiles())
        {
            yield return (
                $"{variant.SizeLabel}_{faceFile.Face.ToString().ToLowerInvariant()}.{WebDavUtilities.GetExtension(faceFile.File.OriginalFileName)}",
                faceFile.File);
        }
    }

    internal static IEnumerable<(string Name, DomainFile File)> GetOriginalFiles(EnvironmentMapVariant variant)
    {
        if (variant.IsPanoramic && variant.File != null)
        {
            yield return (variant.File.OriginalFileName, variant.File);
            yield break;
        }

        foreach (var faceFile in variant.GetOrderedFaceFiles())
            yield return (faceFile.File.OriginalFileName, faceFile.File);
    }
}
