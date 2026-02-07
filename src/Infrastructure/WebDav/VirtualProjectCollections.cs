using Application.Abstractions.Storage;
using Domain.Models;
using Domain.ValueObjects;
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
/// Collection of models for a project - shows model name directories.
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
        var model = _project.Models.FirstOrDefault(m => !m.IsDeleted && m.Name == name);
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
        var items = _project.Models
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
/// Collection representing a single model - shows version subdirectories (v1, v2, etc.).
/// </summary>
public sealed class VirtualModelCollection : VirtualCollectionBase
{
    private readonly Model _model;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualModelCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Model model, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, model.Name)
    {
        _model = model;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"model:{_model.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        // Handle "newest" folder - returns the highest version number
        if (name.Equals("newest", StringComparison.OrdinalIgnoreCase))
        {
            var newestVersion = _model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();

            if (newestVersion == null)
                return Task.FromResult<IStoreItem?>(null);

            return Task.FromResult<IStoreItem?>(new VirtualNewestVersionCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                _model,
                newestVersion,
                _itemPropertyManager,
                _pathProvider));
        }

        // Parse version name like "v1", "v2"
        if (!name.StartsWith("v", StringComparison.OrdinalIgnoreCase) ||
            !int.TryParse(name[1..], out var versionNumber))
            return Task.FromResult<IStoreItem?>(null);

        var version = _model.Versions.FirstOrDefault(v => !v.IsDeleted && v.VersionNumber == versionNumber);
        if (version == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualModelVersionCollection(
            (VirtualCollectionPropertyManager)PropertyManager,
            LockingManager,
            _model,
            version,
            _itemPropertyManager,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var versionItems = _model.Versions
            .Where(v => !v.IsDeleted)
            .OrderBy(v => v.VersionNumber)
            .Select(v => (IStoreItem)new VirtualModelVersionCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                _model,
                v,
                _itemPropertyManager,
                _pathProvider))
            .ToList();

        // Add "newest" folder that mirrors the highest version
        var newestVersion = _model.Versions
            .Where(v => !v.IsDeleted)
            .OrderByDescending(v => v.VersionNumber)
            .FirstOrDefault();

        if (newestVersion != null)
        {
            versionItems.Add(new VirtualNewestVersionCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                _model,
                newestVersion,
                _itemPropertyManager,
                _pathProvider));
        }

        return Task.FromResult<IEnumerable<IStoreItem>>(versionItems);
    }
}

/// <summary>
/// Collection representing a model version - shows files within that version.
/// </summary>
public sealed class VirtualModelVersionCollection : VirtualCollectionBase
{
    private readonly Model _model;
    private readonly ModelVersion _version;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualModelVersionCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Model model, ModelVersion version, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, $"v{version.VersionNumber}")
    {
        _model = model;
        _version = version;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"model:{_model.Id}:version:{_version.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var file = _version.Files.FirstOrDefault(f => f.OriginalFileName == name);
        if (file == null)
            return Task.FromResult<IStoreItem?>(null);

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

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _version.Files.Select(f => (IStoreItem)new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            f.OriginalFileName,
            f.Sha256Hash,
            f.SizeBytes,
            f.MimeType,
            f.CreatedAt,
            f.UpdatedAt,
            _pathProvider));

        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection representing the "newest" folder - shows files from the highest version number.
/// This provides a consistent path to always access the latest model version.
/// </summary>
public sealed class VirtualNewestVersionCollection : VirtualCollectionBase
{
    private readonly Model _model;
    private readonly ModelVersion _version;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualNewestVersionCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, Model model, ModelVersion version, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "newest")
    {
        _model = model;
        _version = version;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"model:{_model.Id}:newest:{_version.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var file = _version.Files.FirstOrDefault(f => f.OriginalFileName == name);
        if (file == null)
            return Task.FromResult<IStoreItem?>(null);

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

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _version.Files.Select(f => (IStoreItem)new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            f.OriginalFileName,
            f.Sha256Hash,
            f.SizeBytes,
            f.MimeType,
            f.CreatedAt,
            f.UpdatedAt,
            _pathProvider));

        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection of texture sets for a project - shows texture set name directories.
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
        var textureSet = _project.TextureSets.FirstOrDefault(ts => !ts.IsDeleted && ts.Name == name);
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
        var items = _project.TextureSets
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
/// Collection representing a single texture set - shows TextureTypes and Files subdirectories.
/// </summary>
public sealed class VirtualTextureSetCollection : VirtualCollectionBase
{
    private readonly TextureSet _textureSet;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualTextureSetCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, TextureSet textureSet, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, textureSet.Name)
    {
        _textureSet = textureSet;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"textureset:{_textureSet.Id}";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        return name.ToLowerInvariant() switch
        {
            "texturetypes" => Task.FromResult<IStoreItem?>(new VirtualTextureTypesCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                _textureSet,
                _itemPropertyManager,
                _pathProvider)),
            "files" => Task.FromResult<IStoreItem?>(new VirtualTextureFilesCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                _textureSet,
                _itemPropertyManager,
                _pathProvider)),
            _ => Task.FromResult<IStoreItem?>(null)
        };
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = new List<IStoreItem>
        {
            new VirtualTextureTypesCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                _textureSet,
                _itemPropertyManager,
                _pathProvider),
            new VirtualTextureFilesCollection(
                (VirtualCollectionPropertyManager)PropertyManager,
                LockingManager,
                _textureSet,
                _itemPropertyManager,
                _pathProvider)
        };
        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }
}

/// <summary>
/// Collection showing textures by their type name (e.g., Roughness.png, AO.png).
/// </summary>
public sealed class VirtualTextureTypesCollection : VirtualCollectionBase
{
    private readonly TextureSet _textureSet;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualTextureTypesCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, TextureSet textureSet, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "TextureTypes")
    {
        _textureSet = textureSet;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"textureset:{_textureSet.Id}:types";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        // Parse type from filename like "Roughness.png"
        var nameWithoutExt = Path.GetFileNameWithoutExtension(name);
        if (!Enum.TryParse<TextureType>(nameWithoutExt, ignoreCase: true, out var textureType))
            return Task.FromResult<IStoreItem?>(null);

        if (textureType == TextureType.SplitChannel)
            return Task.FromResult<IStoreItem?>(null);

        var texture = _textureSet.Textures.FirstOrDefault(t => t.TextureType == textureType);
        if (texture == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            name,
            texture.File.Sha256Hash,
            texture.File.SizeBytes,
            texture.File.MimeType,
            texture.File.CreatedAt,
            texture.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _textureSet.Textures
            .Where(t => t.TextureType != TextureType.SplitChannel)
            .Select(t =>
        {
            var fileName = $"{t.TextureType}.{WebDavUtilities.GetExtension(t.File.OriginalFileName)}";
            return (IStoreItem)new VirtualAssetFile(
                _itemPropertyManager,
                LockingManager,
                fileName,
                t.File.Sha256Hash,
                t.File.SizeBytes,
                t.File.MimeType,
                t.File.CreatedAt,
                t.File.UpdatedAt,
                _pathProvider);
        });

        return Task.FromResult(items);
    }
}

/// <summary>
/// Collection showing original uploaded texture files.
/// </summary>
public sealed class VirtualTextureFilesCollection : VirtualCollectionBase
{
    private readonly TextureSet _textureSet;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualTextureFilesCollection(VirtualCollectionPropertyManager propertyManager, ILockingManager lockingManager, TextureSet textureSet, VirtualItemPropertyManager itemPropertyManager, IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Files")
    {
        _textureSet = textureSet;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => $"textureset:{_textureSet.Id}:files";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var texture = _textureSet.Textures.FirstOrDefault(t => t.File.OriginalFileName == name);
        if (texture == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            texture.File.OriginalFileName,
            texture.File.Sha256Hash,
            texture.File.SizeBytes,
            texture.File.MimeType,
            texture.File.CreatedAt,
            texture.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _textureSet.Textures
            .DistinctBy(t => t.File.OriginalFileName)
            .Select(t => (IStoreItem)new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            t.File.OriginalFileName,
            t.File.Sha256Hash,
            t.File.SizeBytes,
            t.File.MimeType,
            t.File.CreatedAt,
            t.File.UpdatedAt,
            _pathProvider));

        return Task.FromResult(items);
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
