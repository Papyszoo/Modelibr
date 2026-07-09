using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.ModelCategories;

public record GetModelCategoryCountsQuery : IQuery<CategoryCountsResponse>;

internal sealed class GetModelCategoryCountsQueryHandler
    : IQueryHandler<GetModelCategoryCountsQuery, CategoryCountsResponse>
{
    private readonly IModelRepository _modelRepository;

    public GetModelCategoryCountsQueryHandler(IModelRepository modelRepository)
    {
        _modelRepository = modelRepository;
    }

    public async Task<Result<CategoryCountsResponse>> Handle(
        GetModelCategoryCountsQuery query,
        CancellationToken cancellationToken)
    {
        var counts = await _modelRepository.GetCategoryAssetCountsAsync(cancellationToken);
        return Result.Success(CategoryCountsResponse.FromCounts(counts));
    }
}
