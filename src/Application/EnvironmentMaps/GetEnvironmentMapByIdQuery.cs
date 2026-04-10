using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class GetEnvironmentMapByIdQueryHandler : IQueryHandler<GetEnvironmentMapByIdQuery, GetEnvironmentMapByIdResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;

    public GetEnvironmentMapByIdQueryHandler(IEnvironmentMapRepository environmentMapRepository)
    {
        _environmentMapRepository = environmentMapRepository;
    }

    public async Task<Result<GetEnvironmentMapByIdResponse>> Handle(GetEnvironmentMapByIdQuery query, CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(query.Id, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure<GetEnvironmentMapByIdResponse>(
                new Error("EnvironmentMapNotFound", $"Environment map with ID {query.Id} was not found."));
        }

        var previewVariant = environmentMap.GetPreviewVariant();
        var dto = new EnvironmentMapDetailDto
        {
            Id = environmentMap.Id,
            Name = environmentMap.Name,
            VariantCount = environmentMap.VariantCount,
            PreviewVariantId = environmentMap.PreviewVariantId,
            PreviewFileId = previewVariant?.FileId,
            PreviewUrl = previewVariant != null ? $"/files/{previewVariant.FileId}/preview?channel=rgb" : null,
            CreatedAt = environmentMap.CreatedAt,
            UpdatedAt = environmentMap.UpdatedAt,
            Variants = environmentMap.Variants
                .Where(v => !v.IsDeleted)
                .OrderByDescending(v => v.SizeLabel)
                .Select(v => new EnvironmentMapVariantDto(
                    v.Id,
                    v.SizeLabel,
                    v.FileId,
                    v.File.OriginalFileName,
                    v.File.SizeBytes,
                    v.CreatedAt,
                    v.UpdatedAt,
                    v.IsDeleted,
                    $"/files/{v.FileId}/preview?channel=rgb",
                    $"/files/{v.FileId}"))
                .ToList(),
            Packs = environmentMap.Packs
                .Select(p => new EnvironmentMapPackDto(p.Id, p.Name))
                .ToList(),
            Projects = environmentMap.Projects
                .Select(p => new EnvironmentMapProjectDto(p.Id, p.Name))
                .ToList()
        };

        return Result.Success(new GetEnvironmentMapByIdResponse(dto));
    }
}

public record GetEnvironmentMapByIdQuery(int Id) : IQuery<GetEnvironmentMapByIdResponse>;
public record GetEnvironmentMapByIdResponse(EnvironmentMapDetailDto EnvironmentMap);
