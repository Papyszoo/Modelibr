using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.EnvironmentMapCategories;

internal sealed class GetAllEnvironmentMapCategoriesQueryHandler : IQueryHandler<GetAllEnvironmentMapCategoriesQuery, GetAllEnvironmentMapCategoriesResponse>
{
    private readonly IEnvironmentMapCategoryRepository _categoryRepository;

    public GetAllEnvironmentMapCategoriesQueryHandler(IEnvironmentMapCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result<GetAllEnvironmentMapCategoriesResponse>> Handle(GetAllEnvironmentMapCategoriesQuery query, CancellationToken cancellationToken)
    {
        var categories = await _categoryRepository.GetAllAsync(cancellationToken);
        var items = categories
            .OrderBy(c => c.ParentId)
            .ThenBy(c => c.Name)
            .Select(c => EnvironmentMapCategoryMappings.ToSummaryDto(c, categories))
            .ToList();

        return Result.Success(new GetAllEnvironmentMapCategoriesResponse(items));
    }
}

public record GetAllEnvironmentMapCategoriesQuery : IQuery<GetAllEnvironmentMapCategoriesResponse>;
public record GetAllEnvironmentMapCategoriesResponse(IReadOnlyList<EnvironmentMapCategorySummaryDto> Categories);
