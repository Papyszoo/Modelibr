using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
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
    private readonly IAudioSelectionService _audioSelectionService;

    public VirtualAssetStore(
        IServiceScopeFactory scopeFactory,
        IUploadPathProvider pathProvider,
        VirtualItemPropertyManager itemPropertyManager,
        VirtualCollectionPropertyManager collectionPropertyManager,
        NoLockingManager lockingManager,
        IAudioSelectionService audioSelectionService,
        ILogger<VirtualAssetStore> logger)
    {
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
        _itemPropertyManager = itemPropertyManager;
        _collectionPropertyManager = collectionPropertyManager;
        _lockingManager = lockingManager;
        _audioSelectionService = audioSelectionService;
        _logger = logger;
    }

    public async Task<IStoreItem?> GetItemAsync(Uri uri, IHttpContext httpContext)
    {
        var path = GetDecodedPath(uri);
        Console.WriteLine($"[VirtualAssetStore] GetItemAsync: {path}");
        _logger.LogDebug("GetItemAsync: {Path}", path);

        using var scope = _scopeFactory.CreateScope();
        try 
        {
            return await ResolvePathAsync(scope.ServiceProvider, path);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[VirtualAssetStore] ERROR in GetItemAsync: {ex}");
            throw;
        }
    }

    public async Task<IStoreCollection?> GetCollectionAsync(Uri uri, IHttpContext httpContext)
    {
        var path = GetDecodedPath(uri);
        Console.WriteLine($"[VirtualAssetStore] GetCollectionAsync: {path}");
        _logger.LogDebug("GetCollectionAsync: {Path}", path);

        using var scope = _scopeFactory.CreateScope();
        try
        {
            var item = await ResolvePathAsync(scope.ServiceProvider, path);
            return item as IStoreCollection;
        }
        catch (Exception ex)
        {
             Console.WriteLine($"[VirtualAssetStore] ERROR in GetCollectionAsync: {ex}");
             throw;
        }
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

        // Handle "dav" prefix if present from Nginx/Middleware
        if (segments.Length > 0 && segments[0].Equals("dav", StringComparison.OrdinalIgnoreCase))
        {
            segments = segments.Skip(1).ToArray();
        }

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
            "selection" => ResolveSelectionPath(segments),
            _ => null
        };
    }

    /// <summary>
    /// WebDAV-specific query that loads a project with the full asset graph.
    /// Uses AsNoTracking for read-only access and AsSplitQuery to avoid cartesian explosion.
    /// </summary>
    private static async Task<Domain.Models.Project?> GetProjectForWebDavAsync(IServiceProvider sp, string name)
    {
        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        return await dbContext.Projects
            .AsNoTracking()
            .Include(p => p.Models)
                .ThenInclude(m => m.Versions)
                    .ThenInclude(v => v.Files)
            .Include(p => p.TextureSets)
                .ThenInclude(ts => ts.Textures)
                    .ThenInclude(t => t.File)
            .Include(p => p.Sprites)
                .ThenInclude(s => s.File)
            .Include(p => p.Sounds)
                .ThenInclude(s => s.File)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Name == name);
    }

    private IStoreItem? ResolveSelectionPath(string[] segments)
    {
        // /Selection
        if (segments.Length == 1)
        {
            return new VirtualSelectionCollection(
                _collectionPropertyManager,
                _lockingManager,
                _audioSelectionService,
                _itemPropertyManager,
                _scopeFactory,
                _pathProvider);
        }

        // /Selection/{SoundName}Selection.wav
        if (segments.Length == 2)
        {
            var selection = _audioSelectionService.GetSelection();
            if (selection == null)
                return null;

            var expectedName = $"{Path.GetFileNameWithoutExtension(selection.FileName)}Selection.wav";
            if (!string.Equals(segments[1], expectedName, StringComparison.OrdinalIgnoreCase))
                return null;

            return new VirtualAudioSelectionFile(
                _itemPropertyManager,
                _lockingManager,
                _audioSelectionService,
                _scopeFactory,
                _pathProvider);
        }

        return null;
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

        // /Projects/{ProjectName} - use WebDAV-specific query with full includes
        var projectName = Uri.UnescapeDataString(segments[1]);
        var project = await GetProjectForWebDavAsync(sp, projectName);
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
            "models" => ResolveModelPath(project, assetName, segments),
            "texturesets" => ResolveTextureSetPath(project, assetName, segments),
            "sprites" => ResolveProjectSpriteFile(project, assetName),
            "sounds" => ResolveProjectSoundFile(project, assetName),
            _ => null
        };
    }

    /// <summary>
    /// Resolves model paths with hierarchical structure:
    /// /Projects/{P}/Models/{ModelName} → model directory with versions
    /// /Projects/{P}/Models/{ModelName}/v{N} → version directory with files
    /// /Projects/{P}/Models/{ModelName}/v{N}/{FileName} → actual file
    /// </summary>
    private IStoreItem? ResolveModelPath(Domain.Models.Project project, string modelName, string[] segments)
    {
        var model = project.Models.FirstOrDefault(m => !m.IsDeleted && m.Name == modelName);
        if (model == null)
            return null;

        // /Projects/{P}/Models/{ModelName} → show versions
        if (segments.Length == 4)
        {
            return new VirtualModelCollection(_collectionPropertyManager, _lockingManager, model, _itemPropertyManager, _pathProvider);
        }

        // /Projects/{P}/Models/{ModelName}/v{N}
        var versionName = Uri.UnescapeDataString(segments[4]);
        if (!versionName.StartsWith("v", StringComparison.OrdinalIgnoreCase) ||
            !int.TryParse(versionName[1..], out var versionNumber))
            return null;

        var version = model.Versions.FirstOrDefault(v => !v.IsDeleted && v.VersionNumber == versionNumber);
        if (version == null)
            return null;

        // /Projects/{P}/Models/{ModelName}/v{N} → show files in version
        if (segments.Length == 5)
        {
            return new VirtualModelVersionCollection(_collectionPropertyManager, _lockingManager, model, version, _itemPropertyManager, _pathProvider);
        }

        // /Projects/{P}/Models/{ModelName}/v{N}/{FileName} → actual file
        var fileName = Uri.UnescapeDataString(segments[5]);
        var file = version.Files.FirstOrDefault(f => f.OriginalFileName == fileName);
        if (file == null)
            return null;

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

    /// <summary>
    /// Resolves texture set paths with hierarchical structure:
    /// /Projects/{P}/TextureSets/{SetName} → set directory with TextureTypes/Files subdirs
    /// /Projects/{P}/TextureSets/{SetName}/TextureTypes → files named by type (AO.png, Roughness.png)
    /// /Projects/{P}/TextureSets/{SetName}/Files → original uploaded files
    /// </summary>
    private IStoreItem? ResolveTextureSetPath(Domain.Models.Project project, string setName, string[] segments)
    {
        var textureSet = project.TextureSets.FirstOrDefault(ts => !ts.IsDeleted && ts.Name == setName);
        if (textureSet == null)
            return null;

        // /Projects/{P}/TextureSets/{SetName} → show TextureTypes and Files subdirs
        if (segments.Length == 4)
        {
            return new VirtualTextureSetCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider);
        }

        // /Projects/{P}/TextureSets/{SetName}/{SubDir}
        var subDir = Uri.UnescapeDataString(segments[4]).ToLowerInvariant();

        if (segments.Length == 5)
        {
            return subDir switch
            {
                "texturetypes" => new VirtualTextureTypesCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider),
                "files" => new VirtualTextureFilesCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider),
                _ => null
            };
        }

        // /Projects/{P}/TextureSets/{SetName}/{SubDir}/{FileName}
        var fileName = Uri.UnescapeDataString(segments[5]);

        return subDir switch
        {
            "texturetypes" => ResolveTextureTypeFile(textureSet, fileName),
            "files" => ResolveTextureOriginalFile(textureSet, fileName),
            _ => null
        };
    }

    private IStoreItem? ResolveTextureTypeFile(Domain.Models.TextureSet textureSet, string fileName)
    {
        // fileName is like "Roughness.png" - parse to find the texture type
        var nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
        if (!Enum.TryParse<Domain.ValueObjects.TextureType>(nameWithoutExt, ignoreCase: true, out var textureType))
            return null;

        var texture = textureSet.Textures.FirstOrDefault(t => t.TextureType == textureType);
        if (texture == null)
            return null;

        if (texture.SourceChannel == Domain.ValueObjects.TextureChannel.R ||
            texture.SourceChannel == Domain.ValueObjects.TextureChannel.G ||
            texture.SourceChannel == Domain.ValueObjects.TextureChannel.B ||
            texture.SourceChannel == Domain.ValueObjects.TextureChannel.A)
        {
            return new VirtualExtractedTextureFile(
                _itemPropertyManager,
                _lockingManager,
                fileName,
                texture.File.Sha256Hash,
                texture.File.SizeBytes,
                texture.File.CreatedAt,
                texture.File.UpdatedAt,
                _pathProvider,
                texture.SourceChannel);
        }

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            fileName,
            texture.File.Sha256Hash,
            texture.File.SizeBytes,
            texture.File.MimeType,
            texture.File.CreatedAt,
            texture.File.UpdatedAt,
            _pathProvider);
    }

    private IStoreItem? ResolveTextureOriginalFile(Domain.Models.TextureSet textureSet, string fileName)
    {
        var texture = textureSet.Textures.FirstOrDefault(t => t.File.OriginalFileName == fileName);
        if (texture == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            texture.File.OriginalFileName,
            texture.File.Sha256Hash,
            texture.File.SizeBytes,
            texture.File.MimeType,
            texture.File.CreatedAt,
            texture.File.UpdatedAt,
            _pathProvider);
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

    // Internal methods for creating collections accessible to child items
    internal VirtualCollectionPropertyManager CollectionPropertyManager => _collectionPropertyManager;
    internal VirtualItemPropertyManager ItemPropertyManager => _itemPropertyManager;
    internal NoLockingManager LockingManager => _lockingManager;
}
