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
                query.PackIds, query.ProjectIds,
                query.CategoryIds,
                query.TextureTypes,
                query.Kind,
                query.SearchName,
                query.MinResolution,
                cancellationToken);
            textureSets = result.Items;
            totalCount = result.TotalCount;
        }
        else
        {
            textureSets = await _textureSetRepository.GetAllAsync(cancellationToken);

            if (query.PackIds is { Count: > 0 })
                textureSets = textureSets.Where(ts => ts.Packs.Any(p => query.PackIds.Contains(p.Id)));
            if (query.ProjectIds is { Count: > 0 })
                textureSets = textureSets.Where(ts => ts.Projects.Any(p => query.ProjectIds.Contains(p.Id)));
            if (query.CategoryIds is { Count: > 0 })
                textureSets = textureSets.Where(ts =>
                    ts.TextureSetCategoryId.HasValue &&
                    query.CategoryIds.Contains(ts.TextureSetCategoryId.Value));
            if (query.TextureTypes is { Count: > 0 })
                textureSets = textureSets.Where(ts =>
                    ts.Textures.Any(t => query.TextureTypes.Contains(t.TextureType)));
            if (query.Kind.HasValue)
                textureSets = textureSets.Where(ts => ts.Kind == query.Kind.Value);
            if (!string.IsNullOrWhiteSpace(query.SearchName))
            {
                var search = query.SearchName.Trim();
                textureSets = textureSets.Where(ts =>
                    ts.Name.Contains(search, StringComparison.OrdinalIgnoreCase));
            }
            // Keep the set if any texture's largest side meets the threshold
            // (matches the MaxResolution badge, which is the max side); NULL
            // dimensions compare false and are excluded. Mirrors TextureSetRepository.
            if (query.MinResolution.HasValue)
                textureSets = textureSets.Where(ts =>
                    ts.Textures.Any(t => t.Width >= query.MinResolution.Value || t.Height >= query.MinResolution.Value));
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
            // Largest texture side in the set (max over width/height of all textures);
            // null when no texture has extracted dimensions yet.
            MaxResolution = tp.Textures
                .SelectMany(t => new[] { t.Width, t.Height })
                .Where(d => d.HasValue)
                .Select(d => d!.Value)
                .DefaultIfEmpty(0)
                .Max() is var maxSide && maxSide > 0 ? maxSide : null,
            Textures = tp.Textures.Select(t => new TextureListDto
            {
                Id = t.Id,
                TextureType = t.TextureType,
                SourceChannel = t.SourceChannel,
                FileId = t.FileId,
                FileName = t.File != null ? t.File.OriginalFileName : null,
                Width = t.Width,
                Height = t.Height
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

public record GetAllTextureSetsQuery(
    IReadOnlyCollection<int>? PackIds = null,
    IReadOnlyCollection<int>? ProjectIds = null,
    IReadOnlyCollection<int>? CategoryIds = null,
    IReadOnlyCollection<TextureType>? TextureTypes = null,
    int? Page = null,
    int? PageSize = null,
    TextureSetKind? Kind = null,
    string? SearchName = null,
    int? MinResolution = null) : IQuery<GetAllTextureSetsResponse>;
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

    /// <summary>
    /// Largest texture side (max of width/height across all textures in the set),
    /// used by the resolution filter and badge. Null until dimensions are extracted.
    /// </summary>
    public int? MaxResolution { get; init; }
    public ICollection<TextureListDto> Textures { get; init; } = new List<TextureListDto>();
    public ICollection<ModelSummaryListDto> AssociatedModels { get; init; } = new List<ModelSummaryListDto>();
}

/// <summary>
/// Minimal texture info for list views - only essential fields for thumbnails and basic operations.
/// FileName and SourceChannel are required by the model viewer, which builds its
/// textured materials from this list DTO: FileName lets it detect formats the
/// browser cannot decode natively (e.g. TIFF), and SourceChannel drives
/// single-channel extraction.
/// </summary>
public record TextureListDto
{
    public int Id { get; init; }
    public required TextureType TextureType { get; init; }
    public TextureChannel SourceChannel { get; init; }
    public int FileId { get; init; }
    public string? FileName { get; init; }
    public int? Width { get; init; }
    public int? Height { get; init; }
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
