using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using SharedKernel;

namespace Application.RecycledFiles;

public record PermanentDeleteEntityCommand(
    string EntityType,
    int EntityId
) : ICommand<PermanentDeleteEntityResponse>;

public record PermanentDeleteEntityResponse(
    bool Success,
    string Message,
    IEnumerable<DeletedFileInfo> DeletedFiles
);

public record DeletedFileInfo(
    string FilePath,
    string OriginalFileName,
    long SizeBytes
);

public record GetDeletePreviewQuery(
    string EntityType,
    int EntityId
) : IQuery<GetDeletePreviewResponse>;

public record GetDeletePreviewResponse(
    string EntityName,
    IEnumerable<DeletedFileInfo> FilesToDelete,
    IEnumerable<string> RelatedEntities
);

internal sealed class GetDeletePreviewQueryHandler : IQueryHandler<GetDeletePreviewQuery, GetDeletePreviewResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IFileRepository _fileRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly ISoundRepository _soundRepository;

    public GetDeletePreviewQueryHandler(
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IFileRepository fileRepository,
        ITextureSetRepository textureSetRepository,
        ISpriteRepository spriteRepository,
        ISoundRepository soundRepository)
    {
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _fileRepository = fileRepository;
        _textureSetRepository = textureSetRepository;
        _spriteRepository = spriteRepository;
        _soundRepository = soundRepository;
    }

    public async Task<Result<GetDeletePreviewResponse>> Handle(GetDeletePreviewQuery request, CancellationToken cancellationToken)
    {
        var filesToDelete = new List<DeletedFileInfo>();
        var relatedEntities = new List<string>();
        string entityName = "";

        switch (request.EntityType.ToLowerInvariant())
        {
            case "model":
                var model = await _modelRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (model == null)
                    return Result.Failure<GetDeletePreviewResponse>(new Error("ModelNotFound", "Model not found"));
                
                entityName = model.Name;
                // Get unique files from versions
                var uniqueFiles = model.Versions
                    .SelectMany(v => v.Files)
                    .DistinctBy(f => f.Id)
                    .ToList();
                filesToDelete.AddRange(uniqueFiles.Select(f => new DeletedFileInfo(f.FilePath, f.OriginalFileName, f.SizeBytes)));
                
                if (model.Versions.Any())
                    relatedEntities.Add($"{model.Versions.Count} model version(s)");
                if (model.ActiveVersion?.Thumbnail != null)
                    relatedEntities.Add("1 thumbnail");
                break;

            case "modelversion":
                var version = await _modelVersionRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (version == null)
                    return Result.Failure<GetDeletePreviewResponse>(new Error("VersionNotFound", "Model version not found"));
                
                entityName = $"Version {version.VersionNumber}";
                filesToDelete.AddRange(version.Files.Select(f => new DeletedFileInfo(f.FilePath, f.OriginalFileName, f.SizeBytes)));
                break;

            case "file":
                var file = await _fileRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (file == null)
                    return Result.Failure<GetDeletePreviewResponse>(new Error("FileNotFound", "File not found"));
                
                entityName = file.OriginalFileName;
                filesToDelete.Add(new DeletedFileInfo(file.FilePath, file.OriginalFileName, file.SizeBytes));
                break;

            case "textureset":
                var textureSet = await _textureSetRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (textureSet == null)
                    return Result.Failure<GetDeletePreviewResponse>(new Error("TextureSetNotFound", "Texture set not found"));
                
                entityName = textureSet.Name;
                filesToDelete.AddRange(textureSet.Textures.Select(t => new DeletedFileInfo(t.File.FilePath, t.File.OriginalFileName, t.File.SizeBytes)));
                relatedEntities.Add($"{textureSet.Textures.Count} texture(s)");
                break;

            case "sprite":
                var sprite = await _spriteRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (sprite == null)
                    return Result.Failure<GetDeletePreviewResponse>(new Error("SpriteNotFound", "Sprite not found"));
                
                entityName = sprite.Name;
                filesToDelete.Add(new DeletedFileInfo(sprite.File.FilePath, sprite.File.OriginalFileName, sprite.File.SizeBytes));
                break;

            case "sound":
                var sound = await _soundRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (sound == null)
                    return Result.Failure<GetDeletePreviewResponse>(new Error("SoundNotFound", "Sound not found"));
                
                entityName = sound.Name;
                filesToDelete.Add(new DeletedFileInfo(sound.File.FilePath, sound.File.OriginalFileName, sound.File.SizeBytes));
                break;

            default:
                return Result.Failure<GetDeletePreviewResponse>(new Error("InvalidEntityType", $"Unknown entity type: {request.EntityType}"));
        }

        var response = new GetDeletePreviewResponse(entityName, filesToDelete, relatedEntities);
        return Result.Success(response);
    }
}

internal sealed class PermanentDeleteEntityCommandHandler : ICommandHandler<PermanentDeleteEntityCommand, PermanentDeleteEntityResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IFileRepository _fileRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly IFileStorage _fileStorage;

    public PermanentDeleteEntityCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IFileRepository fileRepository,
        ITextureSetRepository textureSetRepository,
        ISpriteRepository spriteRepository,
        ISoundRepository soundRepository,
        IFileStorage fileStorage)
    {
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _fileRepository = fileRepository;
        _textureSetRepository = textureSetRepository;
        _spriteRepository = spriteRepository;
        _soundRepository = soundRepository;
        _fileStorage = fileStorage;
    }

    public async Task<Result<PermanentDeleteEntityResponse>> Handle(PermanentDeleteEntityCommand request, CancellationToken cancellationToken)
    {
        var deletedFiles = new List<DeletedFileInfo>();

        switch (request.EntityType.ToLowerInvariant())
        {
            case "model":
                var model = await _modelRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (model == null)
                    return Result.Failure<PermanentDeleteEntityResponse>(new Error("ModelNotFound", "Model not found"));
                
                
                // Delete version files from disk (version files have direct FK to version, not shared)
                foreach (var version in model.Versions)
                {
                    foreach (var versionFile in version.Files)
                    {
                        await _fileStorage.DeleteFileAsync(versionFile.FilePath, cancellationToken);
                        deletedFiles.Add(new DeletedFileInfo(versionFile.FilePath, versionFile.OriginalFileName, versionFile.SizeBytes));
                    }
                    
                    // Delete version thumbnail from disk if exists
                    if (version.Thumbnail != null && !string.IsNullOrEmpty(version.Thumbnail.ThumbnailPath))
                    {
                        await _fileStorage.DeleteFileAsync(version.Thumbnail.ThumbnailPath, cancellationToken);
                    }
                }
                
                // Delete model and related entities from database
                await _modelRepository.DeleteAsync(request.EntityId, cancellationToken);
                return Result.Success(new PermanentDeleteEntityResponse(true, "Model permanently deleted", deletedFiles));

            case "modelversion":
                var version2 = await _modelVersionRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (version2 == null)
                    return Result.Failure<PermanentDeleteEntityResponse>(new Error("VersionNotFound", "Model version not found"));
                
                // Delete files from disk ONLY if not shared by other versions
                foreach (var versionFile in version2.Files)
                {
                    var isShared = await _fileRepository.IsFileSharedAsync(versionFile.Id, version2.Id, cancellationToken);
                    if (!isShared)
                    {
                        await _fileStorage.DeleteFileAsync(versionFile.FilePath, cancellationToken);
                        deletedFiles.Add(new DeletedFileInfo(versionFile.FilePath, versionFile.OriginalFileName, versionFile.SizeBytes));
                    }
                    // If shared, file stays on disk but DB record for this version's file will be removed
                }
                
                await _modelVersionRepository.DeleteAsync(version2, cancellationToken);
                return Result.Success(new PermanentDeleteEntityResponse(true, "Model version permanently deleted", deletedFiles));

            case "file":
                var fileToDelete = await _fileRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (fileToDelete == null)
                    return Result.Failure<PermanentDeleteEntityResponse>(new Error("FileNotFound", "File not found"));
                
                // Delete file from disk
                await _fileStorage.DeleteFileAsync(fileToDelete.FilePath, cancellationToken);
                deletedFiles.Add(new DeletedFileInfo(fileToDelete.FilePath, fileToDelete.OriginalFileName, fileToDelete.SizeBytes));
                
                // Delete file from database
                await _fileRepository.DeleteAsync(request.EntityId, cancellationToken);
                return Result.Success(new PermanentDeleteEntityResponse(true, "File permanently deleted", deletedFiles));

            case "textureset":
                var textureSet = await _textureSetRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (textureSet == null)
                    return Result.Failure<PermanentDeleteEntityResponse>(new Error("TextureSetNotFound", "Texture set not found"));
                
                // Collect file info before deleting the texture set (cascade will remove Texture entities)
                var textureFileIds = textureSet.Textures
                    .Select(t => new { t.File.Id, t.File.FilePath, t.File.OriginalFileName, t.File.SizeBytes })
                    .ToList();
                
                // Delete the texture set and its textures from database first
                await _textureSetRepository.DeleteAsync(textureSet.Id, cancellationToken);
                
                // Now clean up File entities and physical files
                foreach (var fileInfo in textureFileIds)
                {
                    // Check if the file is still referenced by other entities
                    var isReferenced = await _fileRepository.IsFileHashReferencedByOthersAsync(fileInfo.Id, cancellationToken);
                    if (!isReferenced)
                    {
                        // Delete physical file from disk
                        await _fileStorage.DeleteFileAsync(fileInfo.FilePath, cancellationToken);
                        deletedFiles.Add(new DeletedFileInfo(fileInfo.FilePath, fileInfo.OriginalFileName, fileInfo.SizeBytes));
                        // Delete orphaned File entity from database
                        await _fileRepository.HardDeleteAsync(fileInfo.Id, cancellationToken);
                    }
                }
                
                return Result.Success(new PermanentDeleteEntityResponse(true, "Texture set permanently deleted", deletedFiles));

            case "sprite":
                var spriteToDelete = await _spriteRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (spriteToDelete == null)
                    return Result.Failure<PermanentDeleteEntityResponse>(new Error("SpriteNotFound", "Sprite not found"));
                
                // Collect file info before deletion
                var spriteFileId = spriteToDelete.File.Id;
                var spriteFilePath = spriteToDelete.File.FilePath;
                var spriteFileName = spriteToDelete.File.OriginalFileName;
                var spriteFileSize = spriteToDelete.File.SizeBytes;
                
                // Delete sprite entity from database
                await _spriteRepository.DeleteAsync(spriteToDelete.Id, cancellationToken);
                
                // Check if the file is still referenced by other entities
                var isSpriteFileReferenced = await _fileRepository.IsFileHashReferencedByOthersAsync(spriteFileId, cancellationToken);
                if (!isSpriteFileReferenced)
                {
                    await _fileStorage.DeleteFileAsync(spriteFilePath, cancellationToken);
                    deletedFiles.Add(new DeletedFileInfo(spriteFilePath, spriteFileName, spriteFileSize));
                    await _fileRepository.HardDeleteAsync(spriteFileId, cancellationToken);
                }
                
                return Result.Success(new PermanentDeleteEntityResponse(true, "Sprite permanently deleted", deletedFiles));

            case "sound":
                var soundToDelete = await _soundRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (soundToDelete == null)
                    return Result.Failure<PermanentDeleteEntityResponse>(new Error("SoundNotFound", "Sound not found"));
                
                // Collect file info before deletion
                var soundFileId = soundToDelete.File.Id;
                var soundFilePath = soundToDelete.File.FilePath;
                var soundFileName = soundToDelete.File.OriginalFileName;
                var soundFileSize = soundToDelete.File.SizeBytes;
                
                // Delete sound entity from database
                await _soundRepository.DeleteAsync(soundToDelete.Id, cancellationToken);
                
                // Check if the file is still referenced by other entities
                var isSoundFileReferenced = await _fileRepository.IsFileHashReferencedByOthersAsync(soundFileId, cancellationToken);
                if (!isSoundFileReferenced)
                {
                    await _fileStorage.DeleteFileAsync(soundFilePath, cancellationToken);
                    deletedFiles.Add(new DeletedFileInfo(soundFilePath, soundFileName, soundFileSize));
                    await _fileRepository.HardDeleteAsync(soundFileId, cancellationToken);
                }
                
                return Result.Success(new PermanentDeleteEntityResponse(true, "Sound permanently deleted", deletedFiles));

            default:
                return Result.Failure<PermanentDeleteEntityResponse>(new Error("InvalidEntityType", $"Unknown entity type: {request.EntityType}"));
        }
    }
}
