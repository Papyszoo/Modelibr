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
    IEnumerable<RecycledTextureDto> Textures
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

internal sealed class GetAllRecycledQueryHandler : IQueryHandler<GetAllRecycledQuery, GetAllRecycledQueryResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IFileRepository _fileRepository;
    private readonly ITextureSetRepository _textureSetRepository;

    public GetAllRecycledQueryHandler(
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IFileRepository fileRepository,
        ITextureSetRepository textureSetRepository)
    {
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _fileRepository = fileRepository;
        _textureSetRepository = textureSetRepository;
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
            // Count unique files - version files include all files associated with the model
            m.Versions.SelectMany(v => v.Files).Select(f => f.Id).Distinct().Count()
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
            // Find albedo texture first, then fallback to diffuse for preview
            var previewTexture = ts.Textures.FirstOrDefault(t => t.TextureType == Domain.ValueObjects.TextureType.Albedo)
                              ?? ts.Textures.FirstOrDefault(t => t.TextureType == Domain.ValueObjects.TextureType.Diffuse);
            
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

        var response = new GetAllRecycledQueryResponse(
            modelDtos,
            modelVersionDtos,
            fileDtos,
            textureSetDtos,
            textureDtos
        );

        return Result.Success(response);
    }
}
