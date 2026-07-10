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
    private readonly IBlendFileGenerator _blendFileGenerator;

    public VirtualAssetStore(
        IServiceScopeFactory scopeFactory,
        IUploadPathProvider pathProvider,
        VirtualItemPropertyManager itemPropertyManager,
        VirtualCollectionPropertyManager collectionPropertyManager,
        NoLockingManager lockingManager,
        IAudioSelectionService audioSelectionService,
        IBlendFileGenerator blendFileGenerator,
        ILogger<VirtualAssetStore> logger,
        ILoggerFactory loggerFactory)
    {
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
        _itemPropertyManager = itemPropertyManager;
        _collectionPropertyManager = collectionPropertyManager;
        _lockingManager = lockingManager;
        _audioSelectionService = audioSelectionService;
        _blendFileGenerator = blendFileGenerator;
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
            "environmentmaps" => await ResolveGlobalEnvironmentMapsPathAsync(sp, segments),
            "sprites" => await ResolveSpriteCategoryPathAsync(sp, segments),
            "sounds" => await ResolveSoundCategoryPathAsync(sp, segments),
            "selection" => ResolveSelectionPath(segments),
            _ => null
        };
    }

    /// <summary>
    /// Resolves a WebDAV path segment to a project id using the shared disambiguation
    /// contract (id-suffix first, else an unambiguous case-insensitive name match).
    /// Projects have their own creation-time uniqueness check and are never rendered
    /// with an id suffix — but WebDAV clients on Windows/macOS treat paths
    /// case-insensitively, so a case-only collision must never be guessed at.
    /// </summary>
    private static async Task<int?> ResolveProjectIdAsync(ApplicationDbContext dbContext, string segment)
    {
        if (WebDavUtilities.TryParseIdSuffix(segment, out var baseName, out var suffixId))
        {
            var byId = await dbContext.Projects.AsNoTracking()
                .Where(p => p.Id == suffixId)
                .Select(p => new { p.Id, p.Name })
                .FirstOrDefaultAsync();
            if (byId != null && string.Equals(byId.Name, baseName, StringComparison.OrdinalIgnoreCase))
                return byId.Id;
        }

        var matches = await dbContext.Projects.AsNoTracking()
            .Where(p => p.Name.ToLower() == segment.ToLower())
            .Select(p => p.Id)
            .Take(2)
            .ToListAsync();

        return matches.Count == 1 ? matches[0] : null;
    }

    /// <summary>
    /// WebDAV-specific query that loads a project with the full asset graph.
    /// Uses AsNoTracking for read-only access and AsSplitQuery to avoid cartesian explosion.
    /// </summary>
    private static async Task<Domain.Models.Project?> GetProjectForWebDavAsync(IServiceProvider sp, string segment)
    {
        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        var projectId = await ResolveProjectIdAsync(dbContext, segment);
        if (projectId == null)
            return null;

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
            .Include(p => p.EnvironmentMaps)
                .ThenInclude(e => e.Variants)
                    .ThenInclude(v => v.File)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Id == projectId);
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
                "models" => new VirtualProjectModelsCollection(_collectionPropertyManager, _lockingManager, project, _itemPropertyManager, _pathProvider, _blendFileGenerator, _logger),
                "texturesets" => new VirtualProjectTextureSetsCollection(_collectionPropertyManager, _lockingManager, project, _itemPropertyManager, _pathProvider),
                "environmentmaps" => new VirtualProjectEnvironmentMapsCollection(_collectionPropertyManager, _lockingManager, project, _itemPropertyManager, _pathProvider),
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
            "environmentmaps" => ResolveEnvironmentMapPath(project.EnvironmentMaps, assetName, segments, 4),
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
    private IStoreItem? ResolveModelPath(Domain.Models.Project project, string modelSegment, string[] segments)
    {
        var siblings = project.Models.Where(m => !m.IsDeleted).ToList();
        var model = WebDavUtilities.ResolveSegment(modelSegment, siblings, m => m.Id, m => m.Name);
        if (model == null)
            return null;

        // /Projects/{P}/Models/{ModelName} → show versions
        if (segments.Length == 4)
        {
            var displayName = WebDavUtilities.ComputeDisplayNames(siblings, m => m.Id, m => m.Name)[model.Id];
            return new VirtualModelCollection(_collectionPropertyManager, _lockingManager, model, _itemPropertyManager, _pathProvider, _blendFileGenerator, _logger, displayName);
        }

        // /Projects/{P}/Models/{ModelName}/v{N} or /Projects/{P}/Models/{ModelName}/newest or generated-/uploaded-{ModelName}.blend
        var segment4 = Uri.UnescapeDataString(segments[4]);

        // /Projects/{P}/Models/{ModelName}/generated-{ModelName}.blend → generated .blend from renderable file via Blender CLI
        if (segment4.Equals($"generated-{model.Name}.blend", StringComparison.OrdinalIgnoreCase))
        {
            var newestVersion = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();

            if (newestVersion != null && _blendFileGenerator.IsAvailable)
            {
                var renderableFile = newestVersion.Files
                    .FirstOrDefault(f => f.FileType.IsRenderable);

                if (renderableFile != null)
                {
                    return new VirtualGeneratedBlendFile(
                        _lockingManager,
                        $"generated-{model.Name}.blend",
                        renderableFile.SizeBytes,
                        renderableFile.CreatedAt,
                        renderableFile.UpdatedAt,
                        _blendFileGenerator,
                        model.Id,
                        newestVersion.Id,
                        _logger);
                }
            }

            return null;
        }

        // /Projects/{P}/Models/{ModelName}/uploaded-{ModelName}.blend → actual .blend file from newest version
        if (segment4.Equals($"uploaded-{model.Name}.blend", StringComparison.OrdinalIgnoreCase))
        {
            var newestVersion = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();

            var blendFile = newestVersion?.Files
                .FirstOrDefault(f => f.OriginalFileName.EndsWith(".blend", StringComparison.OrdinalIgnoreCase));

            if (blendFile != null)
            {
                return new VirtualAssetFile(
                    _itemPropertyManager,
                    _lockingManager,
                    $"uploaded-{model.Name}.blend",
                    blendFile.Sha256Hash,
                    blendFile.SizeBytes,
                    blendFile.MimeType,
                    blendFile.CreatedAt,
                    blendFile.UpdatedAt,
                    _pathProvider);
            }

            return null;
        }

        Domain.Models.ModelVersion? version;

        if (segment4.Equals("newest", StringComparison.OrdinalIgnoreCase))
        {
            // Get the highest version number
            version = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();
        }
        else if (segment4.StartsWith("v", StringComparison.OrdinalIgnoreCase) &&
                 int.TryParse(segment4[1..], out var versionNumber))
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
            if (segment4.Equals("newest", StringComparison.OrdinalIgnoreCase))
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
    private IStoreItem? ResolveTextureSetPath(Domain.Models.Project project, string setSegment, string[] segments)
    {
        var siblings = project.TextureSets.Where(ts => !ts.IsDeleted).ToList();
        var textureSet = WebDavUtilities.ResolveSegment(setSegment, siblings, ts => ts.Id, ts => ts.Name);
        if (textureSet == null)
            return null;

        // /Projects/{P}/TextureSets/{SetName} → show TextureTypes and Files subdirs
        if (segments.Length == 4)
        {
            var displayName = WebDavUtilities.ComputeDisplayNames(siblings, ts => ts.Id, ts => ts.Name)[textureSet.Id];
            return new VirtualTextureSetCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider, displayName);
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
        var categorySegment = Uri.UnescapeDataString(segments[1]);

        if (categorySegment.Equals("Unassigned", StringComparison.OrdinalIgnoreCase))
        {
            if (segments.Length == 2)
            {
                var allSounds = await soundRepo.GetAllAsync();
                var unassignedSounds = allSounds.Where(s => s.SoundCategoryId == null && !s.IsDeleted).ToList();
                return new VirtualUnassignedSoundsCollection(_collectionPropertyManager, _lockingManager, unassignedSounds, _itemPropertyManager, _pathProvider);
            }

            // /Sounds/Unassigned/{FileName}
            var fileSegment = Uri.UnescapeDataString(segments[2]);
            var allSoundsForFile = await soundRepo.GetAllAsync();
            var unassignedSiblings = allSoundsForFile.Where(s => s.SoundCategoryId == null && !s.IsDeleted).ToList();
            var sound = WebDavUtilities.ResolveSegment(fileSegment, unassignedSiblings, s => s.Id,
                s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));

            if (sound == null)
                return null;

            var unassignedDisplayName = ComputeSoundFileName(unassignedSiblings, sound.Id);

            return new VirtualAssetFile(
                _itemPropertyManager,
                _lockingManager,
                unassignedDisplayName,
                sound.File.Sha256Hash,
                sound.File.SizeBytes,
                sound.File.MimeType,
                sound.CreatedAt,
                sound.UpdatedAt,
                _pathProvider);
        }

        // Category names are enforced unique per-parent at the DB level (case-sensitively),
        // so a case-only collision is possible for WebDAV clients that treat paths
        // case-insensitively (Windows/macOS) — never guess among duplicates.
        var allCategories = await categoryRepo.GetAllAsync();
        var category = WebDavUtilities.ResolveSegment(categorySegment, allCategories.ToList(), c => c.Id, c => c.Name);
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
        var soundSegment = Uri.UnescapeDataString(segments[2]);
        var sounds = await soundRepo.GetAllAsync();
        var categorySiblings = sounds.Where(s => s.SoundCategoryId == category.Id && !s.IsDeleted).ToList();
        var foundSound = WebDavUtilities.ResolveSegment(soundSegment, categorySiblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));

        if (foundSound == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            ComputeSoundFileName(categorySiblings, foundSound.Id),
            foundSound.File.Sha256Hash,
            foundSound.File.SizeBytes,
            foundSound.File.MimeType,
            foundSound.CreatedAt,
            foundSound.UpdatedAt,
            _pathProvider);
    }

    private static string ComputeSoundFileName(List<Domain.Models.Sound> siblings, int soundId)
    {
        var names = WebDavUtilities.ComputeDisplayNames(siblings, s => s.Id, s => s.Name);
        var sound = siblings.First(s => s.Id == soundId);
        return WebDavUtilities.GetVirtualFileName(names[soundId], sound.File.OriginalFileName);
    }

    private IStoreItem? ResolveProjectSpriteFile(Domain.Models.Project project, string fileSegment)
    {
        var siblings = project.Sprites.Where(s => !s.IsDeleted).ToList();
        var sprite = WebDavUtilities.ResolveSegment(fileSegment, siblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));

        if (sprite == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            ComputeSpriteFileName(siblings, sprite.Id),
            sprite.File.Sha256Hash,
            sprite.File.SizeBytes,
            sprite.File.MimeType,
            sprite.File.CreatedAt,
            sprite.File.UpdatedAt,
            _pathProvider);
    }

    private IStoreItem? ResolveProjectSoundFile(Domain.Models.Project project, string fileSegment)
    {
        var siblings = project.Sounds.Where(s => !s.IsDeleted).ToList();
        var sound = WebDavUtilities.ResolveSegment(fileSegment, siblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));

        if (sound == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            ComputeSoundFileName(siblings, sound.Id),
            sound.File.Sha256Hash,
            sound.File.SizeBytes,
            sound.File.MimeType,
            sound.File.CreatedAt,
            sound.File.UpdatedAt,
            _pathProvider);
    }

    private static string ComputeSpriteFileName(List<Domain.Models.Sprite> siblings, int spriteId)
    {
        var names = WebDavUtilities.ComputeDisplayNames(siblings, s => s.Id, s => s.Name);
        var sprite = siblings.First(s => s.Id == spriteId);
        return WebDavUtilities.GetVirtualFileName(names[spriteId], sprite.File.OriginalFileName);
    }

    /// <summary>
    /// Resolves a WebDAV path segment to a pack id using the shared disambiguation
    /// contract (id-suffix first, else an unambiguous case-insensitive name match).
    /// Packs have their own creation-time uniqueness check and are never rendered
    /// with an id suffix — but WebDAV clients on Windows/macOS treat paths
    /// case-insensitively, so a case-only collision must never be guessed at.
    /// </summary>
    private static async Task<int?> ResolvePackIdAsync(ApplicationDbContext dbContext, string segment)
    {
        if (WebDavUtilities.TryParseIdSuffix(segment, out var baseName, out var suffixId))
        {
            var byId = await dbContext.Packs.AsNoTracking()
                .Where(p => p.Id == suffixId)
                .Select(p => new { p.Id, p.Name })
                .FirstOrDefaultAsync();
            if (byId != null && string.Equals(byId.Name, baseName, StringComparison.OrdinalIgnoreCase))
                return byId.Id;
        }

        var matches = await dbContext.Packs.AsNoTracking()
            .Where(p => p.Name.ToLower() == segment.ToLower())
            .Select(p => p.Id)
            .Take(2)
            .ToListAsync();

        return matches.Count == 1 ? matches[0] : null;
    }

    /// <summary>
    /// WebDAV-specific query that loads a pack with the full asset graph.
    /// Uses AsNoTracking for read-only access and AsSplitQuery to avoid cartesian explosion.
    /// </summary>
    private static async Task<Domain.Models.Pack?> GetPackForWebDavAsync(IServiceProvider sp, string segment)
    {
        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        var packId = await ResolvePackIdAsync(dbContext, segment);
        if (packId == null)
            return null;

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
            .Include(p => p.EnvironmentMaps)
                .ThenInclude(e => e.Variants)
                    .ThenInclude(v => v.File)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Id == packId);
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
    /// Resolves the segment via the shared disambiguation contract (id-suffix first,
    /// else an unambiguous case-insensitive name match — never guesses among duplicates).
    /// </summary>
    private static async Task<Domain.Models.Model?> GetModelForWebDavAsync(IServiceProvider sp, string segment)
    {
        var dbContext = sp.GetRequiredService<ApplicationDbContext>();

        int? modelId = null;

        if (WebDavUtilities.TryParseIdSuffix(segment, out var baseName, out var suffixId))
        {
            var byId = await dbContext.Models.AsNoTracking()
                .Where(m => !m.IsDeleted && m.Id == suffixId)
                .Select(m => new { m.Id, m.Name })
                .FirstOrDefaultAsync();
            if (byId != null && string.Equals(byId.Name, baseName, StringComparison.OrdinalIgnoreCase))
                modelId = byId.Id;
        }

        if (modelId == null)
        {
            var matches = await dbContext.Models.AsNoTracking()
                .Where(m => !m.IsDeleted && m.Name.ToLower() == segment.ToLower())
                .Select(m => m.Id)
                .Take(2)
                .ToListAsync();

            if (matches.Count != 1)
                return null;

            modelId = matches[0];
        }

        return await dbContext.Models
            .AsNoTracking()
            .Where(m => !m.IsDeleted && m.Id == modelId)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .AsSplitQuery()
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Computes a globally-resolved model's WebDAV display name, appending the "[id]"
    /// suffix only if another non-deleted model shares its name case-insensitively.
    /// A lightweight existence check — avoids loading every model just to render one.
    /// </summary>
    private static async Task<string> ComputeGlobalModelDisplayNameAsync(ApplicationDbContext dbContext, Domain.Models.Model model)
    {
        var collides = await dbContext.Models.AsNoTracking()
            .AnyAsync(m => !m.IsDeleted && m.Id != model.Id && m.Name.ToLower() == model.Name.ToLower());

        return collides ? WebDavUtilities.FormatWithIdSuffix(model.Name, model.Id) : model.Name;
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
                "models" => new VirtualPackModelsCollection(_collectionPropertyManager, _lockingManager, pack, _itemPropertyManager, _pathProvider, _blendFileGenerator, _logger),
                "texturesets" => new VirtualPackTextureSetsCollection(_collectionPropertyManager, _lockingManager, pack, _itemPropertyManager, _pathProvider),
                "environmentmaps" => new VirtualPackEnvironmentMapsCollection(_collectionPropertyManager, _lockingManager, pack, _itemPropertyManager, _pathProvider),
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
            "environmentmaps" => ResolveEnvironmentMapPath(pack.EnvironmentMaps, assetName, segments, 4),
            "sprites" => ResolvePackSpriteFile(pack, assetName),
            "sounds" => ResolvePackSoundFile(pack, assetName),
            _ => null
        };
    }

    private IStoreItem? ResolvePackModelPath(Domain.Models.Pack pack, string modelSegment, string[] segments)
    {
        var siblings = pack.Models.Where(m => !m.IsDeleted).ToList();
        var model = WebDavUtilities.ResolveSegment(modelSegment, siblings, m => m.Id, m => m.Name);
        if (model == null)
            return null;

        if (segments.Length == 4)
        {
            var displayName = WebDavUtilities.ComputeDisplayNames(siblings, m => m.Id, m => m.Name)[model.Id];
            return new VirtualModelCollection(_collectionPropertyManager, _lockingManager, model, _itemPropertyManager, _pathProvider, _blendFileGenerator, _logger, displayName);
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

    private IStoreItem? ResolvePackTextureSetPath(Domain.Models.Pack pack, string setSegment, string[] segments)
    {
        var siblings = pack.TextureSets.Where(ts => !ts.IsDeleted).ToList();
        var textureSet = WebDavUtilities.ResolveSegment(setSegment, siblings, ts => ts.Id, ts => ts.Name);
        if (textureSet == null)
            return null;

        if (segments.Length == 4)
        {
            var displayName = WebDavUtilities.ComputeDisplayNames(siblings, ts => ts.Id, ts => ts.Name)[textureSet.Id];
            return new VirtualTextureSetCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider, displayName);
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

    private IStoreItem? ResolvePackSpriteFile(Domain.Models.Pack pack, string fileSegment)
    {
        var siblings = pack.Sprites.Where(s => !s.IsDeleted).ToList();
        var sprite = WebDavUtilities.ResolveSegment(fileSegment, siblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));
        if (sprite == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            ComputeSpriteFileName(siblings, sprite.Id),
            sprite.File.Sha256Hash,
            sprite.File.SizeBytes,
            sprite.File.MimeType,
            sprite.File.CreatedAt,
            sprite.File.UpdatedAt,
            _pathProvider);
    }

    private IStoreItem? ResolvePackSoundFile(Domain.Models.Pack pack, string fileSegment)
    {
        var siblings = pack.Sounds.Where(s => !s.IsDeleted).ToList();
        var sound = WebDavUtilities.ResolveSegment(fileSegment, siblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));
        if (sound == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            ComputeSoundFileName(siblings, sound.Id),
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
            return new VirtualAllModelsCollection(_collectionPropertyManager, _lockingManager, models, _itemPropertyManager, _pathProvider, _blendFileGenerator, _logger);
        }

        // /Models/{ModelName} - use WebDAV-specific query with full includes
        var modelSegment = Uri.UnescapeDataString(segments[1]);
        var model = await GetModelForWebDavAsync(sp, modelSegment);
        if (model == null)
            return null;

        if (segments.Length == 2)
        {
            var displayName = await ComputeGlobalModelDisplayNameAsync(sp.GetRequiredService<ApplicationDbContext>(), model);
            return new VirtualModelCollection(_collectionPropertyManager, _lockingManager, model, _itemPropertyManager, _pathProvider, _blendFileGenerator, _logger, displayName);
        }

        // /Models/{ModelName}/v{N} or /Models/{ModelName}/newest
        var versionName = Uri.UnescapeDataString(segments[2]);

        // /Models/{ModelName}/generated-{ModelName}.blend → generated .blend from renderable file via Blender CLI
        if (versionName.Equals($"generated-{model.Name}.blend", StringComparison.OrdinalIgnoreCase))
        {
            var newestVer = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();

            if (newestVer != null && _blendFileGenerator.IsAvailable)
            {
                var renderableFile = newestVer.Files
                    .FirstOrDefault(f => f.FileType.IsRenderable);

                if (renderableFile != null)
                {
                    return new VirtualGeneratedBlendFile(
                        _lockingManager,
                        $"generated-{model.Name}.blend",
                        renderableFile.SizeBytes,
                        renderableFile.CreatedAt,
                        renderableFile.UpdatedAt,
                        _blendFileGenerator,
                        model.Id,
                        newestVer.Id,
                        _logger);
                }
            }

            return null;
        }

        // /Models/{ModelName}/uploaded-{ModelName}.blend → actual .blend file from newest version
        if (versionName.Equals($"uploaded-{model.Name}.blend", StringComparison.OrdinalIgnoreCase))
        {
            var newestVer = model.Versions
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.VersionNumber)
                .FirstOrDefault();

            var blendFile = newestVer?.Files
                .FirstOrDefault(f => f.OriginalFileName.EndsWith(".blend", StringComparison.OrdinalIgnoreCase));

            if (blendFile != null)
            {
                return new VirtualAssetFile(
                    _itemPropertyManager,
                    _lockingManager,
                    $"uploaded-{model.Name}.blend",
                    blendFile.Sha256Hash,
                    blendFile.SizeBytes,
                    blendFile.MimeType,
                    blendFile.CreatedAt,
                    blendFile.UpdatedAt,
                    _pathProvider);
            }

            return null;
        }

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

        // Both listing and single-item resolution need the full sibling set to compute
        // disambiguated names — GetAllAsync already loads the includes callers need, so
        // reuse it instead of a separate (case-sensitive) GetByNameAsync lookup.
        var allTextureSets = (await textureSetRepo.GetAllAsync()).Where(ts => !ts.IsDeleted).ToList();

        // /TextureSets
        if (segments.Length == 1)
        {
            return new VirtualAllTextureSetsCollection(_collectionPropertyManager, _lockingManager, allTextureSets, _itemPropertyManager, _pathProvider);
        }

        // /TextureSets/{SetName}
        var setSegment = Uri.UnescapeDataString(segments[1]);
        var textureSet = WebDavUtilities.ResolveSegment(setSegment, allTextureSets, ts => ts.Id, ts => ts.Name);
        if (textureSet == null)
            return null;

        if (segments.Length == 2)
        {
            var displayName = WebDavUtilities.ComputeDisplayNames(allTextureSets, ts => ts.Id, ts => ts.Name)[textureSet.Id];
            return new VirtualTextureSetCollection(_collectionPropertyManager, _lockingManager, textureSet, _itemPropertyManager, _pathProvider, displayName);
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

    private async Task<IStoreItem?> ResolveGlobalEnvironmentMapsPathAsync(IServiceProvider sp, string[] segments)
    {
        var environmentMapRepository = sp.GetRequiredService<IEnvironmentMapRepository>();

        // Both listing and single-item resolution need the full sibling set to compute
        // disambiguated names — GetAllAsync already loads the includes callers need, so
        // reuse it instead of a separate (case-sensitive) GetByNameAsync lookup.
        var allEnvironmentMaps = (await environmentMapRepository.GetAllAsync()).Where(e => !e.IsDeleted).ToList();

        if (segments.Length == 1)
        {
            return new VirtualAllEnvironmentMapsCollection(_collectionPropertyManager, _lockingManager, allEnvironmentMaps, _itemPropertyManager, _pathProvider);
        }

        var mapSegment = Uri.UnescapeDataString(segments[1]);
        var environmentMap = WebDavUtilities.ResolveSegment(mapSegment, allEnvironmentMaps, e => e.Id, e => e.Name);
        if (environmentMap == null)
            return null;

        var displayName = WebDavUtilities.ComputeDisplayNames(allEnvironmentMaps, e => e.Id, e => e.Name)[environmentMap.Id];
        return ResolveEnvironmentMapCollection(environmentMap, segments, 2, displayName);
    }

    private IStoreItem? ResolveEnvironmentMapPath(IEnumerable<Domain.Models.EnvironmentMap> environmentMaps, string nameSegment, string[] segments, int baseIndex)
    {
        var siblings = environmentMaps.Where(e => !e.IsDeleted).ToList();
        var environmentMap = WebDavUtilities.ResolveSegment(nameSegment, siblings, e => e.Id, e => e.Name);
        if (environmentMap == null)
            return null;

        var displayName = WebDavUtilities.ComputeDisplayNames(siblings, e => e.Id, e => e.Name)[environmentMap.Id];
        return ResolveEnvironmentMapCollection(environmentMap, segments, baseIndex, displayName);
    }

    private IStoreItem? ResolveEnvironmentMapCollection(Domain.Models.EnvironmentMap environmentMap, string[] segments, int subDirIndex, string? displayName = null)
    {
        if (segments.Length == subDirIndex)
        {
            return new VirtualEnvironmentMapCollection(_collectionPropertyManager, _lockingManager, environmentMap, _itemPropertyManager, _pathProvider, displayName);
        }

        var subDir = Uri.UnescapeDataString(segments[subDirIndex]).ToLowerInvariant();
        if (segments.Length == subDirIndex + 1)
        {
            return subDir switch
            {
                "variants" => new VirtualEnvironmentMapVariantsCollection(_collectionPropertyManager, _lockingManager, environmentMap, _itemPropertyManager, _pathProvider),
                "files" => new VirtualEnvironmentMapFilesCollection(_collectionPropertyManager, _lockingManager, environmentMap, _itemPropertyManager, _pathProvider),
                _ => null
            };
        }

        var fileName = Uri.UnescapeDataString(segments[subDirIndex + 1]);
        return subDir switch
        {
            "variants" => ResolveEnvironmentMapVariantFile(environmentMap, fileName),
            "files" => ResolveEnvironmentMapOriginalFile(environmentMap, fileName),
            _ => null
        };
    }

    private IStoreItem? ResolveEnvironmentMapVariantFile(Domain.Models.EnvironmentMap environmentMap, string fileName)
    {
        var file = environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .SelectMany(EnvironmentMapWebDavNaming.GetVariantFiles)
            .FirstOrDefault(v => v.Name.Equals(fileName, StringComparison.OrdinalIgnoreCase))
            .File;

        return file == null
            ? null
            : new VirtualAssetFile(
                _itemPropertyManager,
                _lockingManager,
                fileName,
                file.Sha256Hash,
                file.SizeBytes,
                file.MimeType,
                file.CreatedAt,
                file.UpdatedAt,
                _pathProvider);
    }

    private IStoreItem? ResolveEnvironmentMapOriginalFile(Domain.Models.EnvironmentMap environmentMap, string fileName)
    {
        var file = environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .SelectMany(EnvironmentMapWebDavNaming.GetOriginalFiles)
            .FirstOrDefault(v => v.Name.Equals(fileName, StringComparison.OrdinalIgnoreCase))
            .File;

        return file == null
            ? null
            : new VirtualAssetFile(
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
        var categorySegment = Uri.UnescapeDataString(segments[1]);

        if (categorySegment.Equals("Unassigned", StringComparison.OrdinalIgnoreCase))
        {
            if (segments.Length == 2)
            {
                var allSprites = await spriteRepo.GetAllAsync();
                var unassignedSprites = allSprites.Where(s => s.SpriteCategoryId == null && !s.IsDeleted).ToList();
                return new VirtualUnassignedSpritesCollection(_collectionPropertyManager, _lockingManager, unassignedSprites, _itemPropertyManager, _pathProvider);
            }

            // /Sprites/Unassigned/{FileName}
            var fileSegment = Uri.UnescapeDataString(segments[2]);
            var allSpritesForFile = await spriteRepo.GetAllAsync();
            var unassignedSiblings = allSpritesForFile.Where(s => s.SpriteCategoryId == null && !s.IsDeleted).ToList();
            var sprite = WebDavUtilities.ResolveSegment(fileSegment, unassignedSiblings, s => s.Id,
                s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));

            if (sprite == null)
                return null;

            return new VirtualAssetFile(
                _itemPropertyManager,
                _lockingManager,
                ComputeSpriteFileName(unassignedSiblings, sprite.Id),
                sprite.File.Sha256Hash,
                sprite.File.SizeBytes,
                sprite.File.MimeType,
                sprite.CreatedAt,
                sprite.UpdatedAt,
                _pathProvider);
        }

        // Category names are enforced unique per-parent at the DB level (case-sensitively),
        // so a case-only collision is possible for WebDAV clients that treat paths
        // case-insensitively (Windows/macOS) — never guess among duplicates.
        var allCategories = await categoryRepo.GetAllAsync();
        var category = WebDavUtilities.ResolveSegment(categorySegment, allCategories.ToList(), c => c.Id, c => c.Name);
        if (category == null)
            return null;

        if (segments.Length == 2)
        {
            var allSprites = await spriteRepo.GetAllAsync();
            var categorySprites = allSprites.Where(s => s.SpriteCategoryId == category.Id && !s.IsDeleted).ToList();
            return new VirtualSpriteCategoryCollection(_collectionPropertyManager, _lockingManager, category, categorySprites, _itemPropertyManager, _pathProvider);
        }

        // /Sprites/{CategoryName}/{FileName}
        var spriteFileSegment = Uri.UnescapeDataString(segments[2]);
        var spritesForFile = await spriteRepo.GetAllAsync();
        var categorySiblings = spritesForFile.Where(s => s.SpriteCategoryId == category.Id && !s.IsDeleted).ToList();
        var foundSprite = WebDavUtilities.ResolveSegment(spriteFileSegment, categorySiblings, s => s.Id,
            s => WebDavUtilities.GetVirtualFileName(s.Name, s.File.OriginalFileName));

        if (foundSprite == null)
            return null;

        return new VirtualAssetFile(
            _itemPropertyManager,
            _lockingManager,
            ComputeSpriteFileName(categorySiblings, foundSprite.Id),
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
