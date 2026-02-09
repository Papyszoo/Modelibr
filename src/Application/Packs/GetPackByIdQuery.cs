using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Packs;

internal class GetPackByIdQueryHandler : IQueryHandler<GetPackByIdQuery, PackDetailDto>
{
    private readonly IPackRepository _packRepository;

    public GetPackByIdQueryHandler(IPackRepository packRepository)
    {
        _packRepository = packRepository;
    }

    public async Task<Result<PackDetailDto>> Handle(GetPackByIdQuery query, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(query.Id, cancellationToken);

        if (pack == null)
        {
            return Result.Failure<PackDetailDto>(
                new Error("PackNotFound", $"Pack with ID {query.Id} was not found."));
        }

        var packDetailDto = new PackDetailDto
        {
            Id = pack.Id,
            Name = pack.Name,
            Description = pack.Description,
            CreatedAt = pack.CreatedAt,
            UpdatedAt = pack.UpdatedAt,
            ModelCount = pack.ModelCount,
            TextureSetCount = pack.TextureSetCount,
            SpriteCount = pack.SpriteCount,
            SoundCount = pack.SoundCount,
            IsEmpty = pack.IsEmpty,
            Models = pack.Models.Select(m => new PackModelDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList(),
            TextureSets = pack.TextureSets.Select(ts => new PackTextureSetDto
            {
                Id = ts.Id,
                Name = ts.Name
            }).ToList(),
            Sprites = pack.Sprites.Select(s => new PackSpriteDto
            {
                Id = s.Id,
                Name = s.Name
            }).ToList()
        };

        return Result.Success(packDetailDto);
    }
}

public record GetPackByIdQuery(int Id) : IQuery<PackDetailDto>;

/// <summary>
/// Detailed DTO for single pack - contains all related models, texture sets, and sprites
/// </summary>
public record PackDetailDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int ModelCount { get; init; }
    public int TextureSetCount { get; init; }
    public int SpriteCount { get; init; }
    public int SoundCount { get; init; }
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
