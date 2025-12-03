using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.SpriteCategories;

internal class GetAllSpriteCategoriesQueryHandler : IQueryHandler<GetAllSpriteCategoriesQuery, GetAllSpriteCategoriesResponse>
{
    private readonly ISpriteCategoryRepository _categoryRepository;

    public GetAllSpriteCategoriesQueryHandler(ISpriteCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result<GetAllSpriteCategoriesResponse>> Handle(GetAllSpriteCategoriesQuery query, CancellationToken cancellationToken)
    {
        var categories = await _categoryRepository.GetAllAsync(cancellationToken);

        var categoryDtos = categories
            .Select(c => new SpriteCategoryDto(
                c.Id,
                c.Name,
                c.Description,
                c.CreatedAt,
                c.UpdatedAt))
            .ToList();

        return Result.Success(new GetAllSpriteCategoriesResponse(categoryDtos));
    }
}

public record GetAllSpriteCategoriesQuery : IQuery<GetAllSpriteCategoriesResponse>;

public record GetAllSpriteCategoriesResponse(IReadOnlyList<SpriteCategoryDto> Categories);

public record SpriteCategoryDto(
    int Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt);
