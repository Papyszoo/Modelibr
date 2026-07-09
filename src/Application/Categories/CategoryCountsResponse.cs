using Application.Abstractions.Repositories;

namespace Application.Categories;

/// <summary>Direct asset count for a single category.</summary>
public sealed record CategoryCountDto(int CategoryId, int Count);

/// <summary>
/// True per-category asset totals for one asset type, driving the category
/// sidebar's count badges. Shared shape across every asset type.
/// </summary>
public sealed record CategoryCountsResponse(
    IReadOnlyList<CategoryCountDto> Categories,
    int UncategorizedCount,
    int TotalCount)
{
    public static CategoryCountsResponse FromCounts(CategoryAssetCounts counts) =>
        new(
            counts.PerCategory
                .Select(kvp => new CategoryCountDto(kvp.Key, kvp.Value))
                .ToList(),
            counts.UncategorizedCount,
            counts.TotalCount);
}
