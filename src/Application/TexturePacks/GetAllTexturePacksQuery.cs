using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TexturePacks;

internal class GetAllTexturePacksQueryHandler : IQueryHandler<GetAllTexturePacksQuery, GetAllTexturePacksResponse>
{
    private readonly ITexturePackRepository _texturePackRepository;

    public GetAllTexturePacksQueryHandler(ITexturePackRepository texturePackRepository)
    {
        _texturePackRepository = texturePackRepository;
    }

    public async Task<Result<GetAllTexturePacksResponse>> Handle(GetAllTexturePacksQuery query, CancellationToken cancellationToken)
    {
        var texturePacks = await _texturePackRepository.GetAllAsync(cancellationToken);

        var texturePackDtos = texturePacks.Select(tp => new TexturePackDto
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
            }).ToList()
        }).ToList();

        return Result.Success(new GetAllTexturePacksResponse(texturePackDtos));
    }
}

public record GetAllTexturePacksQuery() : IQuery<GetAllTexturePacksResponse>;
public record GetAllTexturePacksResponse(IEnumerable<TexturePackDto> TexturePacks);

public record TexturePackDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int TextureCount { get; init; }
    public bool IsEmpty { get; init; }
    public ICollection<TextureDto> Textures { get; init; } = new List<TextureDto>();
    public ICollection<ModelSummaryDto> AssociatedModels { get; init; } = new List<ModelSummaryDto>();
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