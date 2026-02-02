using Application.Abstractions.Storage;
using Domain.Models;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Collection that lists all projects under /Projects.
/// </summary>
public sealed class VirtualProjectsCollection : VirtualCollectionBase
{
    private readonly List<Project> _projects;

    public VirtualProjectsCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, List<Project> projects)
        : base(propertyManager, lockingManager, "Projects")
    {
        _projects = projects;
    }

    public override string UniqueKey => "projects";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var project = _projects.FirstOrDefault(p => p.Name == name);
        if (project == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualProjectCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, project));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _projects.Select(p => (IStoreItem)new VirtualProjectCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, p));
        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection that represents a single project with asset type subfolders.
/// </summary>
public sealed class VirtualProjectCollection : VirtualCollectionBase
{
    private readonly Project _project;

    public VirtualProjectCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Project project)
        : base(propertyManager, lockingManager, project.Name)
    {
        _project = project;
    }

    public override string UniqueKey => $"project:{_project.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        // Subfolders don't have enough context here - resolution is done by the store
        return Task.FromResult<IStoreItem?>(null);
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        // Return placeholder folders - actual content comes from the store
        var items = new List<IStoreItem>
        {
            new VirtualPlaceholderCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "Models", $"project:{_project.Id}:models"),
            new VirtualPlaceholderCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "TextureSets", $"project:{_project.Id}:texturesets"),
            new VirtualPlaceholderCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "Sprites", $"project:{_project.Id}:sprites"),
            new VirtualPlaceholderCollection((VirtualCollectionPropertyManager)PropertyManager, LockingManager, "Sounds", $"project:{_project.Id}:sounds")
        };
        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }
}

/// <summary>
/// Placeholder collection for asset type folders within a project.
/// </summary>
public sealed class VirtualPlaceholderCollection : VirtualCollectionBase
{
    private readonly string _uniqueKey;

    public VirtualPlaceholderCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, string name, string uniqueKey)
        : base(propertyManager, lockingManager, name)
    {
        _uniqueKey = uniqueKey;
    }

    public override string UniqueKey => _uniqueKey;

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        return Task.FromResult<IStoreItem?>(null);
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        return Task.FromResult<IEnumerable<IStoreItem>>(Array.Empty<IStoreItem>());
    }
}

/// <summary>
/// Collection of models for a project.
/// </summary>
public sealed class VirtualProjectModelsCollection : VirtualCollectionBase
{
    private readonly Project _project;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualProjectModelsCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Project project, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Models")
    {
        _project = project;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"project:{_project.Id}:models";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        foreach (var model in _project.Models.Where(m => !m.IsDeleted))
        {
            var activeVersion = model.ActiveVersion;
            if (activeVersion?.Files == null)
                continue;

            var file = activeVersion.Files.FirstOrDefault(f => f.OriginalFileName == name);
            if (file != null)
            {
                return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
                    _itemPropertyManager,
                    LockingManager,
                    file.OriginalFileName,
                    file.Sha256Hash,
                    file.SizeBytes,
                    file.MimeType,
                    file.CreatedAt,
                    file.UpdatedAt,
                    _pathProvider));
            }
        }

        return Task.FromResult<IStoreItem?>(null);
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = new List<IStoreItem>();

        foreach (var model in _project.Models.Where(m => !m.IsDeleted))
        {
            var activeVersion = model.ActiveVersion;
            if (activeVersion?.Files == null)
                continue;

            foreach (var file in activeVersion.Files)
            {
                items.Add(new VirtualAssetFile(
                    _itemPropertyManager,
                    LockingManager,
                    file.OriginalFileName,
                    file.Sha256Hash,
                    file.SizeBytes,
                    file.MimeType,
                    file.CreatedAt,
                    file.UpdatedAt,
                    _pathProvider));
            }
        }

        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }
}

/// <summary>
/// Collection of texture sets for a project.
/// </summary>
public sealed class VirtualProjectTextureSetsCollection : VirtualCollectionBase
{
    private readonly Project _project;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualProjectTextureSetsCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Project project, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "TextureSets")
    {
        _project = project;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"project:{_project.Id}:texturesets";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        foreach (var textureSet in _project.TextureSets.Where(ts => !ts.IsDeleted))
        {
            foreach (var texture in textureSet.Textures)
            {
                var textureName = $"{textureSet.Name}_{texture.TextureType}.{GetExtension(texture.File.OriginalFileName)}";
                if (textureName == name)
                {
                    return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
                        _itemPropertyManager,
                        LockingManager,
                        textureName,
                        texture.File.Sha256Hash,
                        texture.File.SizeBytes,
                        texture.File.MimeType,
                        texture.File.CreatedAt,
                        texture.File.UpdatedAt,
                        _pathProvider));
                }
            }
        }

        return Task.FromResult<IStoreItem?>(null);
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = new List<IStoreItem>();

        foreach (var textureSet in _project.TextureSets.Where(ts => !ts.IsDeleted))
        {
            foreach (var texture in textureSet.Textures)
            {
                var textureName = $"{textureSet.Name}_{texture.TextureType}.{GetExtension(texture.File.OriginalFileName)}";
                items.Add(new VirtualAssetFile(
                    _itemPropertyManager,
                    LockingManager,
                    textureName,
                    texture.File.Sha256Hash,
                    texture.File.SizeBytes,
                    texture.File.MimeType,
                    texture.File.CreatedAt,
                    texture.File.UpdatedAt,
                    _pathProvider));
            }
        }

        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }

    private static string GetExtension(string fileName)
    {
        var dotIndex = fileName.LastIndexOf('.');
        return dotIndex >= 0 ? fileName[(dotIndex + 1)..] : "";
    }
}

/// <summary>
/// Collection of sprites for a project.
/// </summary>
public sealed class VirtualProjectSpritesCollection : VirtualCollectionBase
{
    private readonly Project _project;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualProjectSpritesCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Project project, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Sprites")
    {
        _project = project;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"project:{_project.Id}:sprites";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var sprite = _project.Sprites.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == name);
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
        var items = _project.Sprites
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
/// Collection of sounds for a project.
/// </summary>
public sealed class VirtualProjectSoundsCollection : VirtualCollectionBase
{
    private readonly Project _project;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualProjectSoundsCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Project project, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Sounds")
    {
        _project = project;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"project:{_project.Id}:sounds";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var sound = _project.Sounds.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == name);
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
        var items = _project.Sounds
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
