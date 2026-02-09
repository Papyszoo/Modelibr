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
        IEnumerable<Domain.Models.Sprite> filteredSprites;
        int? totalCount = null;

        if (query.Page.HasValue && query.PageSize.HasValue)
        {
            var result = await _spriteRepository.GetPagedAsync(
                query.Page.Value, query.PageSize.Value,
                query.PackId, query.ProjectId, query.CategoryId,
                cancellationToken);
            filteredSprites = result.Items;
            totalCount = result.TotalCount;
        }
        else
        {
            var sprites = await _spriteRepository.GetAllAsync(cancellationToken);
            filteredSprites = sprites.Where(s => !s.IsDeleted);

            if (query.PackId.HasValue)
                filteredSprites = filteredSprites.Where(s => s.Packs.Any(p => p.Id == query.PackId.Value));
            if (query.ProjectId.HasValue)
                filteredSprites = filteredSprites.Where(s => s.Projects.Any(p => p.Id == query.ProjectId.Value));
            if (query.CategoryId.HasValue)
                filteredSprites = filteredSprites.Where(s => s.SpriteCategoryId == query.CategoryId.Value);
        }

        var spriteDtos = filteredSprites
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

        int? totalPages = (totalCount.HasValue && query.PageSize.HasValue)
            ? (int)Math.Ceiling((double)totalCount.Value / query.PageSize.Value)
            : null;

        return Result.Success(new GetAllSpritesResponse(spriteDtos, totalCount, query.Page, query.PageSize, totalPages));
    }
}

public record GetAllSpritesQuery(int? PackId = null, int? ProjectId = null, int? CategoryId = null, int? Page = null, int? PageSize = null) : IQuery<GetAllSpritesResponse>;

public record GetAllSpritesResponse(IReadOnlyList<SpriteDto> Sprites, int? TotalCount = null, int? Page = null, int? PageSize = null, int? TotalPages = null);

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
