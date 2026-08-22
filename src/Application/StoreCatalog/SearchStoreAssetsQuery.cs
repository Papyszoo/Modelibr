using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.StoreCatalog;

/// <summary>
/// Searches the companion Asset Store's public catalog and marks the hits this library
/// already holds.
/// </summary>
public sealed record SearchStoreAssetsQuery(
    string? Query = null,
    string? ItemType = null,
    string? Tag = null,
    string? Format = null,
    bool FreeOnly = false,
    int Page = 1,
    int PageSize = 12) : IQuery<StoreCatalogSearchResponse>;

/// <summary>
/// A page of store hits and the store they came from.
///
/// <paramref name="Note"/> states this answer's blind spot the way <c>validate_scene</c>
/// does: the catalog is a remote system that this instance does not own, so the result is
/// a point-in-time answer about assets the user does not have yet.
/// </summary>
public sealed record StoreCatalogSearchResponse(
    string StoreUrl,
    IReadOnlyList<StoreCatalogAsset> Assets,
    int TotalCount,
    int Page,
    int PageSize,
    string Note);

internal sealed class SearchStoreAssetsQueryHandler
    : IQueryHandler<SearchStoreAssetsQuery, StoreCatalogSearchResponse>
{
    private const int MaxPageSize = 50;

    private const string ResultNote =
        "These assets are in the companion Asset Store, not in this library. The store is a " +
        "remote system, so this is a point-in-time answer. Prefer a library asset that already " +
        "fits: only propose a store asset when the library's best candidate genuinely fails the " +
        "brief, and say why in the rationale. Hits marked alreadyImported are already here.";

    private readonly IStoreCatalogClient _catalog;
    private readonly IPackRepository _packRepository;

    public SearchStoreAssetsQueryHandler(
        IStoreCatalogClient catalog,
        IPackRepository packRepository)
    {
        _catalog = catalog;
        _packRepository = packRepository;
    }

    public async Task<Result<StoreCatalogSearchResponse>> Handle(
        SearchStoreAssetsQuery query,
        CancellationToken cancellationToken)
    {
        var storeUrl = _catalog.StoreUrl;
        if (string.IsNullOrWhiteSpace(storeUrl))
        {
            return Result.Failure<StoreCatalogSearchResponse>(StoreCatalogErrors.NotConfigured);
        }

        var page = Math.Max(query.Page, 1);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var result = await _catalog.SearchAsync(
            new StoreCatalogQuery(query.Query, query.ItemType, query.Tag, query.Format, query.FreeOnly, page, pageSize),
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<StoreCatalogSearchResponse>(result.Error);
        }

        var assets = await MarkImportedAsync(storeUrl, result.Value.Assets, cancellationToken);

        return Result.Success(new StoreCatalogSearchResponse(
            storeUrl,
            assets,
            result.Value.TotalCount,
            result.Value.Page,
            result.Value.PageSize,
            ResultNote));
    }

    private async Task<IReadOnlyList<StoreCatalogAsset>> MarkImportedAsync(
        string storeUrl,
        IReadOnlyList<StoreCatalogAsset> assets,
        CancellationToken cancellationToken)
    {
        if (assets.Count == 0)
        {
            return assets;
        }

        var imported = await _packRepository.GetImportedStoreAssetIdsAsync(
            storeUrl,
            assets.Select(asset => asset.StoreAssetId).ToList(),
            cancellationToken);

        return assets
            .Select(asset => asset with { AlreadyImported = imported.Contains(asset.StoreAssetId) })
            .ToList();
    }
}
