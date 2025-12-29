using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Models;

internal class GetModelVersionsQueryHandler : IQueryHandler<GetModelVersionsQuery, GetModelVersionsResponse>
{
    private readonly IModelVersionRepository _versionRepository;

    public GetModelVersionsQueryHandler(IModelVersionRepository versionRepository)
    {
        _versionRepository = versionRepository;
    }

    public async Task<Result<GetModelVersionsResponse>> Handle(
        GetModelVersionsQuery query,
        CancellationToken cancellationToken)
    {
        var versions = await _versionRepository.GetByModelIdAsync(query.ModelId, cancellationToken);

        var versionDtos = versions.Select(v => new ModelVersionDto
        {
            Id = v.Id,
            ModelId = v.ModelId,
            VersionNumber = v.VersionNumber,
            Description = v.Description,
            CreatedAt = v.CreatedAt,
            DefaultTextureSetId = v.DefaultTextureSetId,
            ThumbnailUrl = v.Thumbnail?.Status == Domain.ValueObjects.ThumbnailStatus.Ready 
                ? $"/model-versions/{v.Id}/thumbnail/file?t={v.Thumbnail.UpdatedAt:yyyyMMddHHmmss}" 
                : null,
            PngThumbnailUrl = v.Thumbnail?.Status == Domain.ValueObjects.ThumbnailStatus.Ready && !string.IsNullOrEmpty(v.Thumbnail.PngThumbnailPath)
                ? $"/model-versions/{v.Id}/thumbnail/png-file?t={v.Thumbnail.UpdatedAt:yyyyMMddHHmmss}" 
                : null,
            Files = v.Files.Select(f => new VersionFileDto
            {
                Id = f.Id,
                OriginalFileName = f.OriginalFileName,
                MimeType = f.MimeType,
                FileType = f.FileType.Value,
                SizeBytes = f.SizeBytes,
                IsRenderable = f.FileType.IsRenderable
            }).ToList(),
            TextureSetIds = v.TextureSets.Select(ts => ts.Id).ToList()
        }).ToList();

        return Result.Success(new GetModelVersionsResponse(versionDtos));
    }
}

public record GetModelVersionsQuery(int ModelId) : IQuery<GetModelVersionsResponse>;

public record GetModelVersionsResponse(List<ModelVersionDto> Versions);

public class ModelVersionDto
{
    public int Id { get; set; }
    public int ModelId { get; set; }
    public int VersionNumber { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public int? DefaultTextureSetId { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? PngThumbnailUrl { get; set; }
    public List<VersionFileDto> Files { get; set; } = new();
    public List<int> TextureSetIds { get; set; } = new();
}

public class VersionFileDto
{
    public int Id { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool IsRenderable { get; set; }
}
