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

        var textureSetDtos = textureSets.Select(tp => new TextureSetDto
        {
            Id = tp.Id,
            Name = tp.Name,
            CreatedAt = tp.CreatedAt,
            UpdatedAt = tp.UpdatedAt,
            TextureCount = tp.TextureCount,
            IsEmpty = tp.IsEmpty,
            Textures = tp.Textures.Select(t => new TextureDto
            {
                Id = t.Id,
                TextureType = t.TextureType,
                FileId = t.FileId,
                FileName = t.File?.OriginalFileName,
                CreatedAt = t.CreatedAt
            }).ToList(),
            AssociatedModels = tp.Models.Select(m => new ModelSummaryDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList(),
            Packs = tp.Packs.Select(p => new PackSummaryDto
            {
                Id = p.Id,
                Name = p.Name
            }).ToList()
        }).ToList();

        return Result.Success(new GetAllTextureSetsResponse(textureSetDtos));
    }
}

public record GetAllTextureSetsQuery(int? PackId = null) : IQuery<GetAllTextureSetsResponse>;
public record GetAllTextureSetsResponse(IEnumerable<TextureSetDto> TextureSets);

public record TextureSetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int TextureCount { get; init; }
    public bool IsEmpty { get; init; }
    public ICollection<TextureDto> Textures { get; init; } = new List<TextureDto>();
    public ICollection<ModelSummaryDto> AssociatedModels { get; init; } = new List<ModelSummaryDto>();
    public ICollection<PackSummaryDto> Packs { get; init; } = new List<PackSummaryDto>();
}

public record TextureDto
{
    public int Id { get; init; }
    public required TextureType TextureType { get; init; }
    public int FileId { get; init; }
    public string? FileName { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record ModelSummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}

public record PackSummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}