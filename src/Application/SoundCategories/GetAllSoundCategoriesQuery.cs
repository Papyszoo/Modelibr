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
            .OrderBy(c => c.ParentId)
            .ThenBy(c => c.Name)
            .Select(c => SoundCategoryMappings.ToSummaryDto(c, categories))
            .ToList();

        return Result.Success(new GetAllSoundCategoriesResponse(categoryDtos));
    }
}

public record GetAllSoundCategoriesQuery : IQuery<GetAllSoundCategoriesResponse>;

public record GetAllSoundCategoriesResponse(IReadOnlyList<SoundCategorySummaryDto> Categories);
