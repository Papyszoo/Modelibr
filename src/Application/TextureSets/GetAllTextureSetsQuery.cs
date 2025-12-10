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
        var textureSets = await _textureSetRepository.GetAllAsync(cancellationToken);

        // Filter by pack if specified
        if (query.PackId.HasValue)
        {
            textureSets = textureSets.Where(ts => ts.Packs.Any(p => p.Id == query.PackId.Value));
        }

        // Filter by project if specified
        if (query.ProjectId.HasValue)
        {
            textureSets = textureSets.Where(ts => ts.Projects.Any(p => p.Id == query.ProjectId.Value));
        }

        var textureSetListDtos = textureSets.Select(tp => new TextureSetListDto
        {
            Id = tp.Id,
            Name = tp.Name,
            CreatedAt = tp.CreatedAt,
            UpdatedAt = tp.UpdatedAt,
            TextureCount = tp.TextureCount,
            IsEmpty = tp.IsEmpty,
            Textures = tp.Textures.Select(t => new TextureListDto
            {
                Id = t.Id,
                TextureType = t.TextureType,
                FileId = t.FileId
            }).ToList()
        }).ToList();

        return Result.Success(new GetAllTextureSetsResponse(textureSetListDtos));
    }
}

public record GetAllTextureSetsQuery(int? PackId = null, int? ProjectId = null) : IQuery<GetAllTextureSetsResponse>;
public record GetAllTextureSetsResponse(IEnumerable<TextureSetListDto> TextureSets);

/// <summary>
/// Minimal DTO for texture set list - contains only basic information needed for list views
/// Includes minimal texture information for thumbnails and drag-and-drop functionality
/// </summary>
public record TextureSetListDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int TextureCount { get; init; }
    public bool IsEmpty { get; init; }
    public ICollection<TextureListDto> Textures { get; init; } = new List<TextureListDto>();
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