using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.SoundCategories;

internal class GetAllSoundCategoriesQueryHandler : IQueryHandler<GetAllSoundCategoriesQuery, GetAllSoundCategoriesResponse>
{
    private readonly ISoundCategoryRepository _categoryRepository;

    public GetAllSoundCategoriesQueryHandler(ISoundCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result<GetAllSoundCategoriesResponse>> Handle(GetAllSoundCategoriesQuery query, CancellationToken cancellationToken)
    {
        var categories = await _categoryRepository.GetAllAsync(cancellationToken);

        var categoryDtos = categories
            .Select(c => new SoundCategoryDto(
                c.Id,
                c.Name,
                c.Description,
                c.CreatedAt,
                c.UpdatedAt))
            .ToList();

        return Result.Success(new GetAllSoundCategoriesResponse(categoryDtos));
    }
}

public record GetAllSoundCategoriesQuery : IQuery<GetAllSoundCategoriesResponse>;

public record GetAllSoundCategoriesResponse(IReadOnlyList<SoundCategoryDto> Categories);

public record SoundCategoryDto(
    int Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt);
