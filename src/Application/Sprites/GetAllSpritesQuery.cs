using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Sprites;

internal class GetAllSpritesQueryHandler : IQueryHandler<GetAllSpritesQuery, GetAllSpritesResponse>
{
    private readonly ISpriteRepository _spriteRepository;

    public GetAllSpritesQueryHandler(ISpriteRepository spriteRepository)
    {
        _spriteRepository = spriteRepository;
    }

    public async Task<Result<GetAllSpritesResponse>> Handle(GetAllSpritesQuery query, CancellationToken cancellationToken)
    {
        var sprites = await _spriteRepository.GetAllAsync(cancellationToken);

        var spriteDtos = sprites
            .Where(s => !s.IsDeleted)
            .Select(s => new SpriteDto(
                s.Id,
                s.Name,
                s.FileId,
                s.SpriteType,
                s.SpriteCategoryId,
                s.Category?.Name,
                s.File?.OriginalFileName ?? "",
                s.File?.SizeBytes ?? 0,
                s.CreatedAt,
                s.UpdatedAt))
            .ToList();

        return Result.Success(new GetAllSpritesResponse(spriteDtos));
    }
}

public record GetAllSpritesQuery(int? PackId = null, int? ProjectId = null, int? CategoryId = null) : IQuery<GetAllSpritesResponse>;

public record GetAllSpritesResponse(IReadOnlyList<SpriteDto> Sprites);

public record SpriteDto(
    int Id,
    string Name,
    int FileId,
    SpriteType SpriteType,
    int? CategoryId,
    string? CategoryName,
    string FileName,
    long FileSizeBytes,
    DateTime CreatedAt,
    DateTime UpdatedAt);
