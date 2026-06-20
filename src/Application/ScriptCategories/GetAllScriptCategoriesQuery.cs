using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.ScriptCategories;

internal class GetAllScriptCategoriesQueryHandler : IQueryHandler<GetAllScriptCategoriesQuery, GetAllScriptCategoriesResponse>
{
    private readonly IScriptCategoryRepository _categoryRepository;

    public GetAllScriptCategoriesQueryHandler(IScriptCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result<GetAllScriptCategoriesResponse>> Handle(GetAllScriptCategoriesQuery query, CancellationToken cancellationToken)
    {
        var categories = await _categoryRepository.GetAllAsync(cancellationToken);

        var categoryDtos = categories
            .OrderBy(c => c.ParentId)
            .ThenBy(c => c.Name)
            .Select(c => ScriptCategoryMappings.ToSummaryDto(c, categories))
            .ToList();

        return Result.Success(new GetAllScriptCategoriesResponse(categoryDtos));
    }
}

public record GetAllScriptCategoriesQuery : IQuery<GetAllScriptCategoriesResponse>;

public record GetAllScriptCategoriesResponse(IReadOnlyList<ScriptCategorySummaryDto> Categories);
