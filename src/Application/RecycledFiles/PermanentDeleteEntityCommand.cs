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

    public GetDeletePreviewQueryHandler(
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IFileRepository fileRepository,
        ITextureSetRepository textureSetRepository,
        ISpriteRepository spriteRepository)
    {
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _fileRepository = fileRepository;
        _textureSetRepository = textureSetRepository;
        _spriteRepository = spriteRepository;
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
    private readonly IFileStorage _fileStorage;

    public PermanentDeleteEntityCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IFileRepository fileRepository,
        ITextureSetRepository textureSetRepository,
        ISpriteRepository spriteRepository,
        IFileStorage fileStorage)
    {
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _fileRepository = fileRepository;
        _textureSetRepository = textureSetRepository;
        _spriteRepository = spriteRepository;
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
                
                // Delete texture files from disk
                foreach (var texture in textureSet.Textures)
                {
                    await _fileStorage.DeleteFileAsync(texture.File.FilePath, cancellationToken);
                    deletedFiles.Add(new DeletedFileInfo(texture.File.FilePath, texture.File.OriginalFileName, texture.File.SizeBytes));
                }
                
                await _textureSetRepository.DeleteAsync(textureSet.Id, cancellationToken);
                return Result.Success(new PermanentDeleteEntityResponse(true, "Texture set permanently deleted", deletedFiles));

            case "sprite":
                var spriteToDelete = await _spriteRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (spriteToDelete == null)
                    return Result.Failure<PermanentDeleteEntityResponse>(new Error("SpriteNotFound", "Sprite not found"));
                
                // Delete sprite file from disk
                await _fileStorage.DeleteFileAsync(spriteToDelete.File.FilePath, cancellationToken);
                deletedFiles.Add(new DeletedFileInfo(spriteToDelete.File.FilePath, spriteToDelete.File.OriginalFileName, spriteToDelete.File.SizeBytes));
                
                await _spriteRepository.DeleteAsync(spriteToDelete.Id, cancellationToken);
                return Result.Success(new PermanentDeleteEntityResponse(true, "Sprite permanently deleted", deletedFiles));

            default:
                return Result.Failure<PermanentDeleteEntityResponse>(new Error("InvalidEntityType", $"Unknown entity type: {request.EntityType}"));
        }
    }
}
