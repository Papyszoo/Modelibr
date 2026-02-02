using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NWebDav.Server.Http;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Custom WebDAV store that exposes database-driven asset relationships as a virtual directory structure.
/// Supports Project-Centric and Category-Centric views without data duplication.
/// </summary>
public sealed class VirtualAssetStore : IStore
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IUploadPathProvider _pathProvider;
    private readonly ILogger<VirtualAssetStore> _logger;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly VirtualCollectionPropertyManager _collectionPropertyManager;
    private readonly NoLockingManager _lockingManager;

    public VirtualAssetStore(
        IServiceScopeFactory scopeFactory,
        IUploadPathProvider pathProvider,
        VirtualItemPropertyManager itemPropertyManager,
        VirtualCollectionPropertyManager collectionPropertyManager,
        NoLockingManager lockingManager,
        ILogger<VirtualAssetStore> logger)
    {
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
        _itemPropertyManager = itemPropertyManager;
        _collectionPropertyManager = collectionPropertyManager;
        _lockingManager = lockingManager;
        _logger = logger;
    }

    public async Task<IStoreItem?> GetItemAsync(Uri uri, IHttpContext httpContext)
    {
        var path = GetDecodedPath(uri);
        _logger.LogDebug("GetItemAsync: {Path}", path);

        using var scope = _scopeFactory.CreateScope();
        return await ResolvePathAsync(scope.ServiceProvider, path);
    }

    public async Task<IStoreCollection?> GetCollectionAsync(Uri uri, IHttpContext httpContext)
    {
        var path = GetDecodedPath(uri);
        _logger.LogDebug("GetCollectionAsync: {Path}", path);

        using var scope = _scopeFactory.CreateScope();
        var item = await ResolvePathAsync(scope.ServiceProvider, path);
        return item as IStoreCollection;
    }

    private static string GetDecodedPath(Uri uri)
    {
        var path = Uri.UnescapeDataString(uri.AbsolutePath);
        // Remove leading slash and normalize
        if (path.StartsWith('/'))
            path = path[1..];
        return path;
    }

    private async Task<IStoreItem?> ResolvePathAsync(IServiceProvider sp, string path)
    {
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);

        // Root collection
        if (segments.Length == 0)
        {
            return new VirtualRootCollection(_collectionPropertyManager, _lockingManager, this);
        }

        var rootSegment = segments[0].ToLowerInvariant();

        return rootSegment switch
        {
            "projects" => await ResolveProjectPathAsync(sp, segments),
            "sounds" => await ResolveSoundCategoryPathAsync(sp, segments),
            _ => null
        };
    }

    private async Task<IStoreItem?> ResolveProjectPathAsync(IServiceProvider sp, string[] segments)
    {
        var projectRepo = sp.GetRequiredService<IProjectRepository>();

        // /Projects
        if (segments.Length == 1)
        {
            var projects = await projectRepo.GetAllAsync();
            return new VirtualProjectsCollection(_collectionPropertyManager, _lockingManager, projects.ToList());
        }

        // /Projects/{ProjectName}
        var projectName = Uri.UnescapeDataString(segments[1]);
        var project = await projectRepo.GetByNameAsync(projectName);
        if (project == null)
            return null;

        if (segments.Length == 2)
        {
            return new VirtualProjectCollection(_collectionPropertyManager, _lockingManager, project);
        }

        // /Projects/{ProjectName}/{AssetType}
        var assetType = segments[2].ToLowerInvariant();

        if (segments.Length == 3)
        {
            return assetType switch
            {
                "models" => new VirtualProjectModelsCollection(_collectionPropertyManager, _lockingManager, project, _itemPropertyManager, _pathProvider),
                "texturesets" => new VirtualProjectTextureSetsCollection(_collectionPropertyManager, _lockingManager, project, _itemPropertyManager, _pathProvider),
                "sprites" => new VirtualProjectSpritesCollection(_collectionPropertyManager, _lockingManager, project, _itemPropertyManager, _pathProvider),
                "sounds" => new VirtualProjectSoundsCollection(_collectionPropertyManager, _lockingManager, project, _itemPropertyManager, _pathProvider),
                _ => null
            };
        }

        // /Projects/{ProjectName}/{AssetType}/{AssetName}
        var assetName = Uri.UnescapeDataString(segments[3]);

        return assetType switch
        {
            "models" => ResolveProjectModelFile(project, assetName),
            "texturesets" => ResolveProjectTextureSetFile(project, assetName),
            "sprites" => ResolveProjectSpriteFile(project, assetName),
            "sounds" => ResolveProjectSoundFile(project, assetName),
            _ => null
        };
    }

    private async Task<IStoreItem?> ResolveSoundCategoryPathAsync(IServiceProvider sp, string[] segments)
    {
        var categoryRepo = sp.GetRequiredService<ISoundCategoryRepository>();

        // /Sounds
        if (segments.Length == 1)
        {
            var categories = await categoryRepo.GetAllAsync();
            return new VirtualSoundCategoriesCollection(_collectionPropertyManager, _lockingManager, categories.ToList());
        }

        // /Sounds/{CategoryName}
        var categoryName = Uri.UnescapeDataString(segments[1]);
        var category = await categoryRepo.GetByNameAsync(categoryName);
        if (category == null)
            return null;

        if (segments.Length == 2)
        {
            // Need to get sounds for this category
            var soundRepo = sp.GetRequiredService<ISoundRepository>();
            var allSounds = await soundRepo.GetAllAsync();
            var categorySounds = allSounds.Where(s => s.SoundCategoryId == category.Id && !s.IsDeleted).ToList();
            return new VirtualSoundCategoryCollection(_collectionPropertyManager, _lockingManager, category, categorySounds, _itemPropertyManager, _pathProvider);
        }

        // /Sounds/{CategoryName}/{SoundName}
        var soundName = Uri.UnescapeDataString(segments[2]);
        var soundRepoForFile = sp.GetRequiredService<ISoundRepository>();
        var sounds = await soundRepoForFile.GetAllAsync();
        var sound = sounds.FirstOrDefault(s =>
            s.SoundCategoryId == category.Id &&
            !s.IsDeleted &&
            s.File.OriginalFileName == soundName);

        if (sound == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            sound.File.OriginalFileName,
            sound.File.Sha256Hash,
            sound.File.SizeBytes,
            sound.File.MimeType,
            sound.CreatedAt,
            sound.UpdatedAt,
            _pathProvider);
    }

    private IStoreItem? ResolveProjectModelFile(Domain.Models.Project project, string fileName)
    {
        var model = project.Models.FirstOrDefault(m =>
            !m.IsDeleted &&
            m.ActiveVersion?.Files.Any(f => f.OriginalFileName == fileName) == true);

        if (model == null)
            return null;

        var file = model.ActiveVersion!.Files.First(f => f.OriginalFileName == fileName);

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            file.OriginalFileName,
            file.Sha256Hash,
            file.SizeBytes,
            file.MimeType,
            file.CreatedAt,
            file.UpdatedAt,
            _pathProvider);
    }

    private IStoreItem? ResolveProjectTextureSetFile(Domain.Models.Project project, string fileName)
    {
        foreach (var textureSet in project.TextureSets.Where(ts => !ts.IsDeleted))
        {
            foreach (var texture in textureSet.Textures)
            {
                var textureName = $"{textureSet.Name}_{texture.TextureType}.{GetExtension(texture.File.OriginalFileName)}";
                if (textureName == fileName)
                {
                    return new VirtualAssetFile(
                        _itemPropertyManager,
                        _lockingManager,
                        textureName,
                        texture.File.Sha256Hash,
                        texture.File.SizeBytes,
                        texture.File.MimeType,
                        texture.File.CreatedAt,
                        texture.File.UpdatedAt,
                        _pathProvider);
                }
            }
        }

        return null;
    }

    private IStoreItem? ResolveProjectSpriteFile(Domain.Models.Project project, string fileName)
    {
        var sprite = project.Sprites.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == fileName);

        if (sprite == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            sprite.File.OriginalFileName,
            sprite.File.Sha256Hash,
            sprite.File.SizeBytes,
            sprite.File.MimeType,
            sprite.File.CreatedAt,
            sprite.File.UpdatedAt,
            _pathProvider);
    }

    private IStoreItem? ResolveProjectSoundFile(Domain.Models.Project project, string fileName)
    {
        var sound = project.Sounds.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == fileName);

        if (sound == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            sound.File.OriginalFileName,
            sound.File.Sha256Hash,
            sound.File.SizeBytes,
            sound.File.MimeType,
            sound.File.CreatedAt,
            sound.File.UpdatedAt,
            _pathProvider);
    }

    private static string GetExtension(string fileName)
    {
        var dotIndex = fileName.LastIndexOf('.');
        return dotIndex >= 0 ? fileName[(dotIndex + 1)..] : "";
    }

    // Internal methods for creating collections accessible to child items
    internal VirtualCollectionPropertyManager CollectionPropertyManager => _collectionPropertyManager;
    internal VirtualItemPropertyManager ItemPropertyManager => _itemPropertyManager;
    internal NoLockingManager LockingManager => _lockingManager;
}
