using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

internal class GetAllTextureSetsQueryHandler : IQueryHandler<GetAllTextureSetsQuery, GetAllTextureSetsResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;

    public GetAllTextureSetsQueryHandler(ITextureSetRepository textureSetRepository)
    {
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result<GetAllTextureSetsResponse>> Handle(GetAllTextureSetsQuery query, CancellationToken cancellationToken)
    {
        IEnumerable<Domain.Models.TextureSet> textureSets;
        int? totalCount = null;

        if (query.Page.HasValue && query.PageSize.HasValue)
        {
            var result = await _textureSetRepository.GetPagedAsync(
                query.Page.Value, query.PageSize.Value,
                query.PackId, query.ProjectId,
                query.Kind,
                cancellationToken);
            textureSets = result.Items;
            totalCount = result.TotalCount;
        }
        else
        {
            textureSets = await _textureSetRepository.GetAllAsync(cancellationToken);

            if (query.PackId.HasValue)
                textureSets = textureSets.Where(ts => ts.Packs.Any(p => p.Id == query.PackId.Value));
            if (query.ProjectId.HasValue)
                textureSets = textureSets.Where(ts => ts.Projects.Any(p => p.Id == query.ProjectId.Value));
            if (query.Kind.HasValue)
                textureSets = textureSets.Where(ts => ts.Kind == query.Kind.Value);
        }

        var textureSetListDtos = textureSets.Select(tp => new TextureSetListDto
        {
            Id = tp.Id,
            Name = tp.Name,
            Kind = tp.Kind,
            CreatedAt = tp.CreatedAt,
            UpdatedAt = tp.UpdatedAt,
            TextureCount = tp.TextureCount,
            IsEmpty = tp.IsEmpty,
            ThumbnailPath = tp.ThumbnailPath,
            Textures = tp.Textures.Select(t => new TextureListDto
            {
                Id = t.Id,
                TextureType = t.TextureType,
                FileId = t.FileId
            }).ToList(),
            AssociatedModels = tp.ModelVersions.Select(mv => new ModelSummaryListDto
            {
                Id = mv.Model.Id,
                Name = mv.Model.Name,
                ModelVersionId = mv.Id
            }).ToList()
        }).ToList();

        int? totalPages = (totalCount.HasValue && query.PageSize.HasValue)
            ? (int)Math.Ceiling((double)totalCount.Value / query.PageSize.Value)
            : null;

        return Result.Success(new GetAllTextureSetsResponse(
            textureSetListDtos, totalCount, query.Page, query.PageSize, totalPages));
    }
}

public record GetAllTextureSetsQuery(int? PackId = null, int? ProjectId = null, int? Page = null, int? PageSize = null, TextureSetKind? Kind = null) : IQuery<GetAllTextureSetsResponse>;
public record GetAllTextureSetsResponse(IEnumerable<TextureSetListDto> TextureSets, int? TotalCount = null, int? Page = null, int? PageSize = null, int? TotalPages = null);

/// <summary>
/// Minimal DTO for texture set list - contains only basic information needed for list views
/// Includes minimal texture information for thumbnails and drag-and-drop functionality
/// Includes minimal model association info for filtering
/// </summary>
public record TextureSetListDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public TextureSetKind Kind { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int TextureCount { get; init; }
    public bool IsEmpty { get; init; }
    public string? ThumbnailPath { get; init; }
    public ICollection<TextureListDto> Textures { get; init; } = new List<TextureListDto>();
    public ICollection<ModelSummaryListDto> AssociatedModels { get; init; } = new List<ModelSummaryListDto>();
}

/// <summary>
/// Minimal texture info for list views - only essential fields for thumbnails and basic operations
/// </summary>
public record TextureListDto
{
    public int Id { get; init; }
    public required TextureType TextureType { get; init; }
    public int FileId { get; init; }
}

/// <summary>
/// Minimal model summary for list views - only essential fields for filtering and display
/// </summary>
public record ModelSummaryListDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int ModelVersionId { get; init; }
}