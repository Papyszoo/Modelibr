using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSetCategories;

internal sealed class GetAllTextureSetCategoriesQueryHandler : IQueryHandler<GetAllTextureSetCategoriesQuery, GetAllTextureSetCategoriesResponse>
{
    private readonly ITextureSetCategoryRepository _categoryRepository;

    public GetAllTextureSetCategoriesQueryHandler(ITextureSetCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result<GetAllTextureSetCategoriesResponse>> Handle(GetAllTextureSetCategoriesQuery query, CancellationToken cancellationToken)
    {
        var categories = await _categoryRepository.GetAllByKindAsync(query.Kind, cancellationToken);
        var items = categories
            .OrderBy(c => c.ParentId)
            .ThenBy(c => c.Name)
            .Select(c => TextureSetCategoryMappings.ToSummaryDto(c, categories))
            .ToList();

        return Result.Success(new GetAllTextureSetCategoriesResponse(items));
    }
}

public record GetAllTextureSetCategoriesQuery(TextureSetKind Kind) : IQuery<GetAllTextureSetCategoriesResponse>;
public record GetAllTextureSetCategoriesResponse(IReadOnlyList<TextureSetCategorySummaryDto> Categories);
