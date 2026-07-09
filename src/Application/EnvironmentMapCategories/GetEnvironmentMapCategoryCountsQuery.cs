using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.EnvironmentMapCategories;

public record GetEnvironmentMapCategoryCountsQuery : IQuery<CategoryCountsResponse>;

internal sealed class GetEnvironmentMapCategoryCountsQueryHandler
    : IQueryHandler<GetEnvironmentMapCategoryCountsQuery, CategoryCountsResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;

    public GetEnvironmentMapCategoryCountsQueryHandler(IEnvironmentMapRepository environmentMapRepository)
    {
        _environmentMapRepository = environmentMapRepository;
    }

    public async Task<Result<CategoryCountsResponse>> Handle(
        GetEnvironmentMapCategoryCountsQuery query,
        CancellationToken cancellationToken)
    {
        var counts = await _environmentMapRepository.GetCategoryAssetCountsAsync(cancellationToken);
        return Result.Success(CategoryCountsResponse.FromCounts(counts));
    }
}
