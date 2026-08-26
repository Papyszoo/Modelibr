using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.StoreCatalog;

/// <summary>Reads one store asset's public detail, plus whether this library already has it.</summary>
public sealed record GetStoreAssetQuery(string StoreAssetId) : IQuery<StoreCatalogAssetResponse>;

/// <summary>
/// One store asset, and what acquiring it would take from here.
///
/// <paramref name="CanImportWithoutAccount"/> is the honest answer to "can the agent fetch
/// this by itself": a free approved asset can be pulled with no credential, anything else
/// needs the user's store session and is therefore a UI action, not an MCP one.
/// </summary>
public sealed record StoreCatalogAssetResponse(
    string StoreUrl,
    StoreCatalogAsset Asset,
    bool CanImportWithoutAccount,
    string Note);

internal sealed class GetStoreAssetQueryHandler
    : IQueryHandler<GetStoreAssetQuery, StoreCatalogAssetResponse>
{
    private const string FreeNote =
        "Free and approved, so this can be imported without a store account. It is still an " +
        "acquisition: import it against a slot the user is actually filling, never speculatively.";

    private const string PaidNote =
        "This is not free, so it cannot be acquired from here. Propose it as a slot candidate " +
        "and let the user accept it - their signed-in session is what mints the import token.";

    private const string ImportedNote =
        "This store asset has already been imported into the local library. Search the library " +
        "for it rather than importing it again.";

    private readonly IStoreCatalogClient _catalog;
    private readonly IPackRepository _packRepository;

    public GetStoreAssetQueryHandler(
        IStoreCatalogClient catalog,
        IPackRepository packRepository)
    {
        _catalog = catalog;
        _packRepository = packRepository;
    }

    public async Task<Result<StoreCatalogAssetResponse>> Handle(
        GetStoreAssetQuery query,
        CancellationToken cancellationToken)
    {
        var storeUrl = _catalog.StoreUrl;
        if (string.IsNullOrWhiteSpace(storeUrl))
        {
            return Result.Failure<StoreCatalogAssetResponse>(StoreCatalogErrors.NotConfigured);
        }

        if (string.IsNullOrWhiteSpace(query.StoreAssetId))
        {
            return Result.Failure<StoreCatalogAssetResponse>(
                new Error("StoreCatalog.InvalidAssetId", "A store asset id is required."));
        }

        var result = await _catalog.GetAssetAsync(query.StoreAssetId.Trim(), cancellationToken);
        if (result.IsFailure)
        {
            return Result.Failure<StoreCatalogAssetResponse>(result.Error);
        }

        var existing = await _packRepository.GetByStoreImportAsync(
            storeUrl, result.Value.StoreAssetId, cancellationToken);
        var asset = result.Value with { AlreadyImported = existing != null };

        var note = asset.AlreadyImported
            ? ImportedNote
            : asset.IsFree ? FreeNote : PaidNote;

        return Result.Success(new StoreCatalogAssetResponse(
            storeUrl,
            asset,
            CanImportWithoutAccount: asset.IsFree && !asset.AlreadyImported,
            note));
    }
}
