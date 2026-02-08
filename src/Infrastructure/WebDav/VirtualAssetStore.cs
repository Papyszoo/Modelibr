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
    private readonly ILoggerFactory _loggerFactory;
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
        ILogger<VirtualAssetStore> logger,
        ILoggerFactory loggerFactory)
    {
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
        _itemPropertyManager = itemPropertyManager;
        _collectionPropertyManager = collectionPropertyManager;
        _lockingManager = lockingManager;
        _audioSelectionService = audioSelectionService;
        _logger = logger;
        _loggerFactory = loggerFactory;
    }

    public async Task<IStoreItem?> GetItemAsync(Uri uri, IHttpContext httpContext)
    {
        var path = GetDecodedPath(uri);
        _logger.LogDebug("GetItemAsync: {Path}", path);

        using var scope = _scopeFactory.CreateScope();
        try 
        {
            return await ResolvePathAsync(scope.ServiceProvider, path);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetItemAsync for path: {Path}", path);
            throw;
        }
    }

    public async Task<IStoreCollection?> GetCollectionAsync(Uri uri, IHttpContext httpContext)
    {
        var path = GetDecodedPath(uri);
        _logger.LogDebug("GetCollectionAsync: {Path}", path);

        using var scope = _scopeFactory.CreateScope();
        try
        {
            var item = await ResolvePathAsync(scope.ServiceProvider, path);
            return item as IStoreCollection;
        }
        catch (Exception ex)
        {
             _logger.LogError(ex, "Error in GetCollectionAsync for path: {Path}", path);
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

        // Handle "modelibr" prefix if present from Nginx/Middleware
        if (segments.Length > 0 && segments[0].Equals("modelibr", StringComparison.OrdinalIgnoreCase))
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
            "packs" => await ResolvePackPathAsync(sp, segments),
            "models" => await ResolveGlobalModelsPathAsync(sp, segments),
            "texturesets" => await ResolveGlobalTextureSetsPathAsync(sp, segments),
            "sprites" => await ResolveSpriteCategoryPathAsync(sp, segments),
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
    /// /Projects/{P}/Models/{ModelName}/newest → newest version directory with files
    /// /Projects/{P}/Models/{ModelName}/v{N}/{FileName} → actual file
    /// /Projects/{P}/Models/{ModelName}/newest/{FileName} → actual file from newest version
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

        // /Projects/{P}/Models/{ModelName}/v{N} or /Projects/{P}/Models/{ModelName}/newest
        var versionName = Uri.UnescapeDataString(segments[4]);
        Domain.Models.ModelVersion? version;

        if (versionName.Equals("newest", StringComparison.OrdinalIgnoreCase))
        {
            // Get the highest version number
            version = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();
        }
        else if (versionName.StartsWith("v", StringComparison.OrdinalIgnoreCase) &&
                 int.TryParse(versionName[1..], out var versionNumber))
        {
            version = model.Versions.FirstOrDefault(v => !v.IsDeleted && v.VersionNumber == versionNumber);
        }
        else
        {
            return null;
        }

        if (version == null)
            return null;

        // /Projects/{P}/Models/{ModelName}/v{N} or newest → show files in version
        if (segments.Length == 5)
        {
            if (versionName.Equals("newest", StringComparison.OrdinalIgnoreCase))
            {
                return new VirtualNewestVersionCollection(_collectionPropertyManager, _lockingManager, model, version, _itemPropertyManager, _pathProvider);
            }
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
                texture.SourceChannel,
                _loggerFactory.CreateLogger<VirtualExtractedTextureFile>());
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
        var soundRepo = sp.GetRequiredService<ISoundRepository>();

        // /Sounds
        if (segments.Length == 1)
        {
            var categories = await categoryRepo.GetAllAsync();
            var allSounds = await soundRepo.GetAllAsync();
            var hasUnassigned = allSounds.Any(s => s.SoundCategoryId == null && !s.IsDeleted);
            return new VirtualSoundCategoriesCollection(_collectionPropertyManager, _lockingManager, categories.ToList(), hasUnassigned);
        }

        // /Sounds/{CategoryName} or /Sounds/Unassigned
        var categoryName = Uri.UnescapeDataString(segments[1]);

        if (categoryName.Equals("Unassigned", StringComparison.OrdinalIgnoreCase))
        {
            if (segments.Length == 2)
            {
                var allSounds = await soundRepo.GetAllAsync();
                var unassignedSounds = allSounds.Where(s => s.SoundCategoryId == null && !s.IsDeleted).ToList();
                return new VirtualUnassignedSoundsCollection(_collectionPropertyManager, _lockingManager, unassignedSounds, _itemPropertyManager, _pathProvider);
            }

            // /Sounds/Unassigned/{FileName}
            var fileName = Uri.UnescapeDataString(segments[2]);
            var allSoundsForFile = await soundRepo.GetAllAsync();
            var sound = allSoundsForFile.FirstOrDefault(s =>
                s.SoundCategoryId == null &&
                !s.IsDeleted &&
                s.File.OriginalFileName == fileName);

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

        var category = await categoryRepo.GetByNameAsync(categoryName);
        if (category == null)
            return null;

        if (segments.Length == 2)
        {
            // Need to get sounds for this category
            var allSounds = await soundRepo.GetAllAsync();
            var categorySounds = allSounds.Where(s => s.SoundCategoryId == category.Id && !s.IsDeleted).ToList();
            return new VirtualSoundCategoryCollection(_collectionPropertyManager, _lockingManager, category, categorySounds, _itemPropertyManager, _pathProvider);
        }

        // /Sounds/{CategoryName}/{SoundName}
        var soundName = Uri.UnescapeDataString(segments[2]);
        var sounds = await soundRepo.GetAllAsync();
        var foundSound = sounds.FirstOrDefault(s =>
            s.SoundCategoryId == category.Id &&
            !s.IsDeleted &&
            s.File.OriginalFileName == soundName);

        if (foundSound == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            foundSound.File.OriginalFileName,
            foundSound.File.Sha256Hash,
            foundSound.File.SizeBytes,
            foundSound.File.MimeType,
            foundSound.CreatedAt,
            foundSound.UpdatedAt,
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

    /// <summary>
    /// WebDAV-specific query that loads a pack with the full asset graph.
    /// Uses AsNoTracking for read-only access and AsSplitQuery to avoid cartesian explosion.
    /// </summary>
    private static async Task<Domain.Models.Pack?> GetPackForWebDavAsync(IServiceProvider sp, string name)
    {
        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        return await dbContext.Packs
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

    /// <summary>
    /// WebDAV-specific query that loads all models with full version information.
    /// Uses AsNoTracking for read-only access and AsSplitQuery to avoid cartesian explosion.
    /// </summary>
    private static async Task<List<Domain.Models.Model>> GetModelsForWebDavAsync(IServiceProvider sp)
    {
        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        return await dbContext.Models
            .AsNoTracking()
            .Where(m => !m.IsDeleted)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .AsSplitQuery()
            .ToListAsync();
    }

    /// <summary>
    /// WebDAV-specific query that loads a single model with full version information.
    /// Uses AsNoTracking for read-only access and AsSplitQuery to avoid cartesian explosion.
    /// </summary>
    private static async Task<Domain.Models.Model?> GetModelForWebDavAsync(IServiceProvider sp, string name)
    {
        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        return await dbContext.Models
            .AsNoTracking()
            .Where(m => !m.IsDeleted && m.Name == name)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .AsSplitQuery()
            .FirstOrDefaultAsync();
    }

    private async Task<IStoreItem?> ResolvePackPathAsync(IServiceProvider sp, string[] segments)
    {
        var packRepo = sp.GetRequiredService<IPackRepository>();

        // /Packs
        if (segments.Length == 1)
        {
            var packs = await packRepo.GetAllAsync();
            return new VirtualPacksCollection(_collectionPropertyManager, _lockingManager, packs.ToList());
        }

        // /Packs/{PackName} - use WebDAV-specific query with full includes
        var packName = Uri.UnescapeDataString(segments[1]);
        var pack = await GetPackForWebDavAsync(sp, packName);
        if (pack == null)
            return null;

        if (segments.Length == 2)
        {
            return new VirtualPackCollection(_collectionPropertyManager, _lockingManager, pack);
        }

        // /Packs/{PackName}/{AssetType}
        var assetType = segments[2].ToLowerInvariant();

        if (segments.Length == 3)
        {
            return assetType switch
            {
                "models" => new VirtualPackModelsCollection(_collectionPropertyManager, _lockingManager, pack, _itemPropertyManager, _pathProvider),
                "texturesets" => new VirtualPackTextureSetsCollection(_collectionPropertyManager, _lockingManager, pack, _itemPropertyManager, _pathProvider),
                "sprites" => new VirtualPackSpritesCollection(_collectionPropertyManager, _lockingManager, pack, _itemPropertyManager, _pathProvider),
                "sounds" => new VirtualPackSoundsCollection(_collectionPropertyManager, _lockingManager, pack, _itemPropertyManager, _pathProvider),
                _ => null
            };
        }

        // /Packs/{PackName}/{AssetType}/{AssetName}
        var assetName = Uri.UnescapeDataString(segments[3]);

        return assetType switch
        {
            "models" => ResolvePackModelPath(pack, assetName, segments),
            "texturesets" => ResolvePackTextureSetPath(pack, assetName, segments),
            "sprites" => ResolvePackSpriteFile(pack, assetName),
            "sounds" => ResolvePackSoundFile(pack, assetName),
            _ => null
        };
    }

    private IStoreItem? ResolvePackModelPath(Domain.Models.Pack pack, string modelName, string[] segments)
    {
        var model = pack.Models.FirstOrDefault(m => !m.IsDeleted && m.Name == modelName);
        if (model == null)
            return null;

        if (segments.Length == 4)
        {
            return new VirtualModelCollection(_collectionPropertyManager, _lockingManager, model, _itemPropertyManager, _pathProvider);
        }

        var versionName = Uri.UnescapeDataString(segments[4]);
        Domain.Models.ModelVersion? version;

        if (versionName.Equals("newest", StringComparison.OrdinalIgnoreCase))
        {
            version = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();
        }
        else if (versionName.StartsWith("v", StringComparison.OrdinalIgnoreCase) &&
                 int.TryParse(versionName[1..], out var versionNumber))
        {
            version = model.Versions.FirstOrDefault(v => !v.IsDeleted && v.VersionNumber == versionNumber);
        }
        else
        {
            return null;
        }

        if (version == null)
            return null;

        if (segments.Length == 5)
        {
            if (versionName.Equals("newest", StringComparison.OrdinalIgnoreCase))
            {
                return new VirtualNewestVersionCollection(_collectionPropertyManager, _lockingManager, model, version, _itemPropertyManager, _pathProvider);
            }
            return new VirtualModelVersionCollection(_collectionPropertyManager, _lockingManager, model, version, _itemPropertyManager, _pathProvider);
        }

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

    private IStoreItem? ResolvePackTextureSetPath(Domain.Models.Pack pack, string setName, string[] segments)
    {
        var textureSet = pack.TextureSets.FirstOrDefault(ts => !ts.IsDeleted && ts.Name == setName);
        if (textureSet == null)
            return null;

        if (segments.Length == 4)
        {
            return new VirtualTextureSetCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider);
        }

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

        var fileName = Uri.UnescapeDataString(segments[5]);

        return subDir switch
        {
            "texturetypes" => ResolveTextureTypeFile(textureSet, fileName),
            "files" => ResolveTextureOriginalFile(textureSet, fileName),
            _ => null
        };
    }

    private IStoreItem? ResolvePackSpriteFile(Domain.Models.Pack pack, string fileName)
    {
        var sprite = pack.Sprites.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == fileName);
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

    private IStoreItem? ResolvePackSoundFile(Domain.Models.Pack pack, string fileName)
    {
        var sound = pack.Sounds.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == fileName);
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

    private async Task<IStoreItem?> ResolveGlobalModelsPathAsync(IServiceProvider sp, string[] segments)
    {
        // /Models
        if (segments.Length == 1)
        {
            var models = await GetModelsForWebDavAsync(sp);
            return new VirtualAllModelsCollection(_collectionPropertyManager, _lockingManager, models, _itemPropertyManager, _pathProvider);
        }

        // /Models/{ModelName} - use WebDAV-specific query with full includes
        var modelName = Uri.UnescapeDataString(segments[1]);
        var model = await GetModelForWebDavAsync(sp, modelName);
        if (model == null)
            return null;

        if (segments.Length == 2)
        {
            return new VirtualModelCollection(_collectionPropertyManager, _lockingManager, model, _itemPropertyManager, _pathProvider);
        }

        // /Models/{ModelName}/v{N} or /Models/{ModelName}/newest
        var versionName = Uri.UnescapeDataString(segments[2]);
        Domain.Models.ModelVersion? version;

        if (versionName.Equals("newest", StringComparison.OrdinalIgnoreCase))
        {
            version = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();
        }
        else if (versionName.StartsWith("v", StringComparison.OrdinalIgnoreCase) &&
                 int.TryParse(versionName[1..], out var versionNumber))
        {
            version = model.Versions.FirstOrDefault(v => !v.IsDeleted && v.VersionNumber == versionNumber);
        }
        else
        {
            return null;
        }

        if (version == null)
            return null;

        if (segments.Length == 3)
        {
            if (versionName.Equals("newest", StringComparison.OrdinalIgnoreCase))
            {
                return new VirtualNewestVersionCollection(_collectionPropertyManager, _lockingManager, model, version, _itemPropertyManager, _pathProvider);
            }
            return new VirtualModelVersionCollection(_collectionPropertyManager, _lockingManager, model, version, _itemPropertyManager, _pathProvider);
        }

        // /Models/{ModelName}/v{N}/{FileName}
        var fileName = Uri.UnescapeDataString(segments[3]);
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

    private async Task<IStoreItem?> ResolveGlobalTextureSetsPathAsync(IServiceProvider sp, string[] segments)
    {
        var textureSetRepo = sp.GetRequiredService<ITextureSetRepository>();

        // /TextureSets
        if (segments.Length == 1)
        {
            var textureSets = await textureSetRepo.GetAllAsync();
            return new VirtualAllTextureSetsCollection(_collectionPropertyManager, _lockingManager, textureSets.ToList(), _itemPropertyManager, _pathProvider);
        }

        // /TextureSets/{SetName}
        var setName = Uri.UnescapeDataString(segments[1]);
        var textureSet = await textureSetRepo.GetByNameAsync(setName);
        if (textureSet == null || textureSet.IsDeleted)
            return null;

        if (segments.Length == 2)
        {
            return new VirtualTextureSetCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider);
        }

        // /TextureSets/{SetName}/{SubDir}
        var subDir = Uri.UnescapeDataString(segments[2]).ToLowerInvariant();

        if (segments.Length == 3)
        {
            return subDir switch
            {
                "texturetypes" => new VirtualTextureTypesCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider),
                "files" => new VirtualTextureFilesCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider),
                _ => null
            };
        }

        // /TextureSets/{SetName}/{SubDir}/{FileName}
        var fileName = Uri.UnescapeDataString(segments[3]);

        return subDir switch
        {
            "texturetypes" => ResolveTextureTypeFile(textureSet, fileName),
            "files" => ResolveTextureOriginalFile(textureSet, fileName),
            _ => null
        };
    }

    private async Task<IStoreItem?> ResolveSpriteCategoryPathAsync(IServiceProvider sp, string[] segments)
    {
        var categoryRepo = sp.GetRequiredService<ISpriteCategoryRepository>();
        var spriteRepo = sp.GetRequiredService<ISpriteRepository>();

        // /Sprites
        if (segments.Length == 1)
        {
            var categories = await categoryRepo.GetAllAsync();
            var allSprites = await spriteRepo.GetAllAsync();
            var hasUnassigned = allSprites.Any(s => s.SpriteCategoryId == null && !s.IsDeleted);
            return new VirtualSpriteCategoriesCollection(_collectionPropertyManager, _lockingManager, categories.ToList(), hasUnassigned);
        }

        // /Sprites/{CategoryName} or /Sprites/Unassigned
        var categoryName = Uri.UnescapeDataString(segments[1]);

        if (categoryName.Equals("Unassigned", StringComparison.OrdinalIgnoreCase))
        {
            if (segments.Length == 2)
            {
                var allSprites = await spriteRepo.GetAllAsync();
                var unassignedSprites = allSprites.Where(s => s.SpriteCategoryId == null && !s.IsDeleted).ToList();
                return new VirtualUnassignedSpritesCollection(_collectionPropertyManager, _lockingManager, unassignedSprites, _itemPropertyManager, _pathProvider);
            }

            // /Sprites/Unassigned/{FileName}
            var fileName = Uri.UnescapeDataString(segments[2]);
            var allSpritesForFile = await spriteRepo.GetAllAsync();
            var sprite = allSpritesForFile.FirstOrDefault(s =>
                s.SpriteCategoryId == null &&
                !s.IsDeleted &&
                s.File.OriginalFileName == fileName);

            if (sprite == null)
                return null;

            return new VirtualAssetFile(
                _itemPropertyManager,
                _lockingManager,
                sprite.File.OriginalFileName,
                sprite.File.Sha256Hash,
                sprite.File.SizeBytes,
                sprite.File.MimeType,
                sprite.CreatedAt,
                sprite.UpdatedAt,
                _pathProvider);
        }

        var category = await categoryRepo.GetByNameAsync(categoryName);
        if (category == null)
            return null;

        if (segments.Length == 2)
        {
            var allSprites = await spriteRepo.GetAllAsync();
            var categorySprites = allSprites.Where(s => s.SpriteCategoryId == category.Id && !s.IsDeleted).ToList();
            return new VirtualSpriteCategoryCollection(_collectionPropertyManager, _lockingManager, category, categorySprites, _itemPropertyManager, _pathProvider);
        }

        // /Sprites/{CategoryName}/{FileName}
        var spriteFileName = Uri.UnescapeDataString(segments[2]);
        var spritesForFile = await spriteRepo.GetAllAsync();
        var foundSprite = spritesForFile.FirstOrDefault(s =>
            s.SpriteCategoryId == category.Id &&
            !s.IsDeleted &&
            s.File.OriginalFileName == spriteFileName);

        if (foundSprite == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            foundSprite.File.OriginalFileName,
            foundSprite.File.Sha256Hash,
            foundSprite.File.SizeBytes,
            foundSprite.File.MimeType,
            foundSprite.CreatedAt,
            foundSprite.UpdatedAt,
            _pathProvider);
    }

    // Internal methods for creating collections accessible to child items
    internal VirtualCollectionPropertyManager CollectionPropertyManager => _collectionPropertyManager;
    internal VirtualItemPropertyManager ItemPropertyManager => _itemPropertyManager;
    internal NoLockingManager LockingManager => _lockingManager;
}
