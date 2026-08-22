using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.StoreCatalog;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Read-only tools over the companion Asset Store's public catalog (v0.6 prompt 15, part A).
///
/// The library is the default answer and these tools do not change that: they exist for the
/// case where the library genuinely cannot fill a slot. Nothing here acquires anything -
/// they send no credential, and the store's public catalog needs none.
///
/// The store is optional and remote, so an unreachable store is reported as a plain result
/// with a distinguishable error code. It must never be mistaken for an empty store, and it
/// never affects <c>search_assets</c>.
/// </summary>
[McpServerToolType]
public sealed class StoreCatalogMcpTools
{
    [McpServerTool(Name = "search_store_assets")]
    [Description("Search the companion Asset Store's public catalog for assets that are NOT in this library. " +
                 "Use it only when the library cannot fill a slot - search_assets first, always. " +
                 "Hits are store assets: their ids are store ids, not library ids, and nothing here is placeable " +
                 "until it has been imported. Each hit carries `alreadyImported`; never propose one that is true. " +
                 "An unreachable store returns error code StoreCatalog.Unreachable - that is not an empty store.")]
    public static async Task<object> SearchStoreAssets(
        IQueryHandler<SearchStoreAssetsQuery, StoreCatalogSearchResponse> handler,
        [Description("Free-text query. It matches an asset's title, author and description only - NOT the names " +
                     "of the items inside a pack. A twenty-model furniture pack is found by 'furniture', not by " +
                     "'armchair', so search wide and read the items in get_store_asset.")] string? query = null,
        [Description("Item type filter, using the store's own taxonomy, e.g. Model | Texture | Sound | Sprite. " +
                     "This is the reliable narrowing filter - prefer it over tag.")] string? itemType = null,
        [Description("Tag filter, from the store's tag vocabulary - not this library's. Note that store tagging " +
                     "is sparse: a tag can exist in the vocabulary while no asset carries it, so a tag filter " +
                     "returning nothing means nothing. Do not conclude the store is empty from a tag miss.")] string? tag = null,
        [Description("File format filter, e.g. glb | fbx | wav.")] string? format = null,
        [Description("Only assets that cost nothing. A paid asset cannot be acquired without the user's " +
                     "store session, so set this true unless you are deliberately showing them a purchase. " +
                     "The store has no free-only filter of its own, so this drops paid hits AFTER paging: " +
                     "a page can come back shorter than pageSize while totalCount still counts the paid ones.")]
        bool freeOnly = true,
        [Description("Page number, 1-based.")] int page = 1,
        [Description("Results per page (1-50).")] int pageSize = 12,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new SearchStoreAssetsQuery(query, itemType, tag, format, freeOnly, page, pageSize),
            cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    [McpServerTool(Name = "get_store_asset")]
    [Description("Get one store asset's public detail: its items, previews, licence, price and whether this " +
                 "library already holds it. `canImportWithoutAccount` is the honest answer to whether you can " +
                 "fetch it yourself - free approved assets need no store account, anything else needs the user " +
                 "to accept it while signed in.")]
    public static async Task<object> GetStoreAsset(
        IQueryHandler<GetStoreAssetQuery, StoreCatalogAssetResponse> handler,
        [Description("Store asset id (a Guid, from a search_store_assets hit).")] string storeAssetId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetStoreAssetQuery(storeAssetId), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }
}
