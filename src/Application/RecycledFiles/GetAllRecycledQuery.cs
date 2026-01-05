using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.RecycledFiles;

public record GetAllRecycledQuery : IQuery<GetAllRecycledQueryResponse>;

public record GetAllRecycledQueryResponse(
    IEnumerable<RecycledModelDto> Models,
    IEnumerable<RecycledModelVersionDto> ModelVersions,
    IEnumerable<RecycledFileDto> Files,
    IEnumerable<RecycledTextureSetDto> TextureSets,
    IEnumerable<RecycledTextureDto> Textures,
    IEnumerable<RecycledSpriteDto> Sprites
);

public record RecycledModelDto(
    int Id,
    string Name,
    DateTime DeletedAt,
    int FileCount
);

public record RecycledModelVersionDto(
    int Id,
    int ModelId,
    int VersionNumber,
    string? Description,
    DateTime DeletedAt,
    int FileCount
);

public record RecycledFileDto(
    int Id,
    string OriginalFileName,
    string FilePath,
    long SizeBytes,
    DateTime DeletedAt
);

public record RecycledTextureSetDto(
    int Id,
    string Name,
    DateTime DeletedAt,
    int TextureCount,
    int? PreviewFileId
);

public record RecycledTextureDto(
    int Id,
    int FileId,
    string TextureType,
    DateTime DeletedAt
);

public record RecycledSpriteDto(
    int Id,
    string Name,
    int FileId,
    DateTime DeletedAt
);

internal sealed class GetAllRecycledQueryHandler : IQueryHandler<GetAllRecycledQuery, GetAllRecycledQueryResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IFileRepository _fileRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ISpriteRepository _spriteRepository;

    public GetAllRecycledQueryHandler(
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

    public async Task<Result<GetAllRecycledQueryResponse>> Handle(GetAllRecycledQuery request, CancellationToken cancellationToken)
    {
        var models = await _modelRepository.GetAllDeletedAsync(cancellationToken);
        var modelVersions = await _modelVersionRepository.GetAllDeletedAsync(cancellationToken);
        var files = await _fileRepository.GetAllDeletedAsync(cancellationToken);
        var textureSets = await _textureSetRepository.GetAllDeletedAsync(cancellationToken);

        var modelDtos = models.Select(m => new RecycledModelDto(
            m.Id,
            m.Name,
            m.DeletedAt!.Value,
            // Count unique files from versions
            m.Versions.SelectMany(v => v.Files).DistinctBy(f => f.Id).Count()
        )).ToList();

        var modelVersionDtos = modelVersions.Select(v => new RecycledModelVersionDto(
            v.Id,
            v.ModelId,
            v.VersionNumber,
            v.Description,
            v.DeletedAt!.Value,
            v.Files.Count
        )).ToList();

        var fileDtos = files.Select(f => new RecycledFileDto(
            f.Id,
            f.OriginalFileName,
            f.FilePath,
            f.SizeBytes,
            f.DeletedAt!.Value
        )).ToList();

        var textureSetDtos = textureSets.Select(ts => {
            // Find albedo texture for preview
            var previewTexture = ts.Textures.FirstOrDefault(t => t.TextureType == Domain.ValueObjects.TextureType.Albedo);
            
            return new RecycledTextureSetDto(
                ts.Id,
                ts.Name,
                ts.DeletedAt!.Value,
                ts.Textures.Count,
                previewTexture?.FileId
            );
        }).ToList();

        // Get deleted textures from deleted texture sets
        var textureDtos = textureSets
            .SelectMany(ts => ts.Textures.Where(t => t.IsDeleted))
            .Select(t => new RecycledTextureDto(
                t.Id,
                t.FileId,
                t.TextureType.ToString(),
                t.DeletedAt!.Value
            )).ToList();

        // Get deleted sprites
        var sprites = await _spriteRepository.GetAllDeletedAsync(cancellationToken);
        var spriteDtos = sprites.Select(s => new RecycledSpriteDto(
            s.Id,
            s.Name,
            s.FileId,
            s.DeletedAt!.Value
        )).ToList();

        var response = new GetAllRecycledQueryResponse(
            modelDtos,
            modelVersionDtos,
            fileDtos,
            textureSetDtos,
            textureDtos,
            spriteDtos
        );

        return Result.Success(response);
    }
}
