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

        var packListDtos = packs.Select(p => new PackListDto
        {
            Id = p.Id,
            Name = p.Name,
            Description = p.Description,
            CreatedAt = p.CreatedAt,
            UpdatedAt = p.UpdatedAt,
            ModelCount = p.ModelCount,
            TextureSetCount = p.TextureSetCount,
            SpriteCount = p.SpriteCount,
            IsEmpty = p.IsEmpty
        }).ToList();

        return Result.Success(new GetAllPacksResponse(packListDtos));
    }
}

public record GetAllPacksQuery() : IQuery<GetAllPacksResponse>;
public record GetAllPacksResponse(IEnumerable<PackListDto> Packs);

/// <summary>
/// Minimal DTO for pack list - contains only basic information and counts needed for list views
/// </summary>
public record PackListDto
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
}
