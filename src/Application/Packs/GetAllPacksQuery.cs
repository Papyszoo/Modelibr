using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Packs;

internal class GetAllPacksQueryHandler : IQueryHandler<GetAllPacksQuery, GetAllPacksResponse>
{
    private readonly IPackRepository _packRepository;

    public GetAllPacksQueryHandler(IPackRepository packRepository)
    {
        _packRepository = packRepository;
    }

    public async Task<Result<GetAllPacksResponse>> Handle(GetAllPacksQuery query, CancellationToken cancellationToken)
    {
        var packs = await _packRepository.GetAllAsync(cancellationToken);

        var packDtos = packs.Select(p => new PackDto
        {
            Id = p.Id,
            Name = p.Name,
            Description = p.Description,
            CreatedAt = p.CreatedAt,
            UpdatedAt = p.UpdatedAt,
            ModelCount = p.ModelCount,
            TextureSetCount = p.TextureSetCount,
            SpriteCount = p.SpriteCount,
            IsEmpty = p.IsEmpty,
            Models = p.Models.Select(m => new PackModelDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList(),
            TextureSets = p.TextureSets.Select(ts => new PackTextureSetDto
            {
                Id = ts.Id,
                Name = ts.Name
            }).ToList(),
            Sprites = p.Sprites.Select(s => new PackSpriteDto
            {
                Id = s.Id,
                Name = s.Name
            }).ToList()
        }).ToList();

        return Result.Success(new GetAllPacksResponse(packDtos));
    }
}

public record GetAllPacksQuery() : IQuery<GetAllPacksResponse>;
public record GetAllPacksResponse(IEnumerable<PackDto> Packs);

public record PackDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int ModelCount { get; init; }
    public int TextureSetCount { get; init; }
    public int SpriteCount { get; init; }
    public bool IsEmpty { get; init; }
    public ICollection<PackModelDto> Models { get; init; } = new List<PackModelDto>();
    public ICollection<PackTextureSetDto> TextureSets { get; init; } = new List<PackTextureSetDto>();
    public ICollection<PackSpriteDto> Sprites { get; init; } = new List<PackSpriteDto>();
}

public record PackModelDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}

public record PackTextureSetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}

public record PackSpriteDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}
