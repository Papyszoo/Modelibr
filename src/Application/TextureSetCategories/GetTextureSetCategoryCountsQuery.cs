using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSetCategories;

public record GetTextureSetCategoryCountsQuery(TextureSetKind Kind)
    : IQuery<CategoryCountsResponse>;

internal sealed class GetTextureSetCategoryCountsQueryHandler
    : IQueryHandler<GetTextureSetCategoryCountsQuery, CategoryCountsResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;

    public GetTextureSetCategoryCountsQueryHandler(ITextureSetRepository textureSetRepository)
    {
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result<CategoryCountsResponse>> Handle(
        GetTextureSetCategoryCountsQuery query,
        CancellationToken cancellationToken)
    {
        var counts = await _textureSetRepository.GetCategoryAssetCountsAsync(query.Kind, cancellationToken);
        return Result.Success(CategoryCountsResponse.FromCounts(counts));
    }
}
