using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.TextureSetCategories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

internal class GetAllTextureSetsQueryHandler : IQueryHandler<GetAllTextureSetsQuery, GetAllTextureSetsResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ITextureSetCategoryRepository _textureSetCategoryRepository;

    public GetAllTextureSetsQueryHandler(ITextureSetRepository textureSetRepository, ITextureSetCategoryRepository textureSetCategoryRepository)
    {
        _textureSetRepository = textureSetRepository;
        _textureSetCategoryRepository = textureSetCategoryRepository;
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
                query.CategoryId,
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
            if (query.CategoryId.HasValue)
                textureSets = textureSets.Where(ts => ts.TextureSetCategoryId == query.CategoryId.Value);
            if (query.Kind.HasValue)
                textureSets = textureSets.Where(ts => ts.Kind == query.Kind.Value);
        }

        var categories = await _textureSetCategoryRepository.GetAllAsync(cancellationToken);

        var textureSetListDtos = textureSets.Select(tp => new TextureSetListDto
        {
            Id = tp.Id,
            Name = tp.Name,
            CategoryId = tp.TextureSetCategoryId,
            CategoryPath = tp.TextureSetCategoryId.HasValue
                ? TextureSetCategoryMappings.BuildPath(categories.FirstOrDefault(c => c.Id == tp.TextureSetCategoryId.Value))
                : null,
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
            AssociatedModels = tp.ModelVersionMappings.Select(m => new ModelSummaryListDto
            {
                Id = m.ModelVersion.Model.Id,
                Name = m.ModelVersion.Model.Name,
                ModelVersionId = m.ModelVersionId,
                MaterialName = m.MaterialName
            }).ToList()
        }).ToList();

        int? totalPages = (totalCount.HasValue && query.PageSize.HasValue)
            ? (int)Math.Ceiling((double)totalCount.Value / query.PageSize.Value)
            : null;

        return Result.Success(new GetAllTextureSetsResponse(
            textureSetListDtos, totalCount, query.Page, query.PageSize, totalPages));
    }
}

public record GetAllTextureSetsQuery(int? PackId = null, int? ProjectId = null, int? CategoryId = null, int? Page = null, int? PageSize = null, TextureSetKind? Kind = null) : IQuery<GetAllTextureSetsResponse>;
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
    public int? CategoryId { get; init; }
    public string? CategoryPath { get; init; }
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
    public string MaterialName { get; init; } = string.Empty;
}
