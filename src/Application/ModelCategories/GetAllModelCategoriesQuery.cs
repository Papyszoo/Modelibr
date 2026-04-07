using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using SharedKernel;

namespace Application.ModelCategories;

internal sealed class GetAllModelCategoriesQueryHandler : IQueryHandler<GetAllModelCategoriesQuery, GetAllModelCategoriesResponse>
{
    private readonly IModelCategoryRepository _categoryRepository;

    public GetAllModelCategoriesQueryHandler(IModelCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result<GetAllModelCategoriesResponse>> Handle(GetAllModelCategoriesQuery query, CancellationToken cancellationToken)
    {
        var categories = await _categoryRepository.GetAllAsync(cancellationToken);
        var items = categories
            .OrderBy(c => c.ParentId)
            .ThenBy(c => c.Name)
            .Select(c => new ModelCategorySummaryDto
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                ParentId = c.ParentId,
                Path = BuildPath(c, categories)
            })
            .ToList();

        return Result.Success(new GetAllModelCategoriesResponse(items));
    }

    private static string BuildPath(Domain.Models.ModelCategory category, IReadOnlyList<Domain.Models.ModelCategory> categories)
    {
        var segments = new Stack<string>();
        var current = category;
        while (current != null)
        {
            segments.Push(current.Name);
            current = current.ParentId.HasValue
                ? categories.FirstOrDefault(c => c.Id == current.ParentId.Value)
                : null!;
        }

        return string.Join(" / ", segments);
    }
}

public record GetAllModelCategoriesQuery : IQuery<GetAllModelCategoriesResponse>;
public record GetAllModelCategoriesResponse(IReadOnlyList<ModelCategorySummaryDto> Categories);