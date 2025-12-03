using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Sprites;

internal class GetSpriteByIdQueryHandler : IQueryHandler<GetSpriteByIdQuery, GetSpriteByIdResponse>
{
    private readonly ISpriteRepository _spriteRepository;

    public GetSpriteByIdQueryHandler(ISpriteRepository spriteRepository)
    {
        _spriteRepository = spriteRepository;
    }

    public async Task<Result<GetSpriteByIdResponse>> Handle(GetSpriteByIdQuery query, CancellationToken cancellationToken)
    {
        var sprite = await _spriteRepository.GetByIdAsync(query.Id, cancellationToken);

        if (sprite == null)
        {
            return Result.Failure<GetSpriteByIdResponse>(
                new Error("SpriteNotFound", $"Sprite with ID {query.Id} not found."));
        }

        var spriteDto = new SpriteDto(
            sprite.Id,
            sprite.Name,
            sprite.FileId,
            sprite.SpriteType,
            sprite.SpriteCategoryId,
            sprite.Category?.Name,
            sprite.File?.OriginalFileName ?? "",
            sprite.File?.SizeBytes ?? 0,
            sprite.CreatedAt,
            sprite.UpdatedAt);

        return Result.Success(new GetSpriteByIdResponse(spriteDto));
    }
}

public record GetSpriteByIdQuery(int Id) : IQuery<GetSpriteByIdResponse>;
public record GetSpriteByIdResponse(SpriteDto Sprite);
