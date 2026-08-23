namespace Application.StoreCatalog;

/// <summary>
/// What the store's public catalog is asked for. A deliberately narrow subset of
/// <c>GET /api/assets</c>: the store owns its own ranking, and re-exposing every knob here
/// would make this a second search API to keep in sync rather than a window onto one.
/// </summary>
public sealed record StoreCatalogQuery(
    string? Search = null,
    string? ItemType = null,
    string? Tag = null,
    string? Format = null,
    bool FreeOnly = false,
    int Page = 1,
    int PageSize = 12);

/// <summary>One page of store hits, plus the paging facts needed to ask for the next.</summary>
public sealed record StoreCatalogPage(
    IReadOnlyList<StoreCatalogAsset> Assets,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>
/// A store asset as the public catalog describes it.
///
/// Ids are the store's Guids, never local ids, and the distinction is load-bearing: an
/// agent that confuses the two would place a node against an asset that does not exist
/// locally. <see cref="AlreadyImported"/> is answered locally from pack provenance, not by
/// the store, which knows nothing about this user's library.
/// </summary>
public sealed record StoreCatalogAsset(
    string StoreAssetId,
    string Title,
    string? Description,
    string? Author,
    decimal Price,
    string? Currency,
    bool IsFree,
    IReadOnlyList<string> ItemTypes,
    IReadOnlyList<string> Formats,
    IReadOnlyList<string> Tags,
    int ItemCount,
    long TotalSizeBytes,
    string? ThumbnailUrl,
    bool AlreadyImported,
    string? CreditName = null,
    string? License = null,
    IReadOnlyList<StoreCatalogItem>? Items = null,
    IReadOnlyList<StoreCatalogPreview>? Previews = null,
    IReadOnlyList<StoreCatalogMatchedItem>? MatchedItems = null,
    // Nullable, and null whenever MatchedItems is: a plain 0 alongside an absent list reads
    // as "nothing inside this pack matched", which is the opposite of "this store cannot
    // search inside packs". The two must be absent together or present together.
    int? MatchedItemCount = null);

/// <summary>
/// One item inside a pack whose name matched the search term.
///
/// A pack is found by its own title and description, which say nothing about the thousands
/// of things inside it - so a search that matched on an item reports which ones, and these
/// ids are what a partial import selects on. That is the whole route from "I need an
/// armchair" to acquiring one model rather than a 2 GB pack.
///
/// Older store deployments do not send this. Absent is not empty: it means the store could
/// not answer the question, not that nothing inside the pack matched.
/// </summary>
public sealed record StoreCatalogMatchedItem(
    string ItemId,
    string? Name,
    string? ItemType);

/// <summary>
/// One typed item inside a store pack, from the public asset detail. The store's own
/// taxonomy category is carried through unchanged rather than mapped onto Modelibr's -
/// two vocabularies that look alike are worse than two that are plainly separate.
/// </summary>
public sealed record StoreCatalogItem(
    string ItemId,
    string? Name,
    string? ItemType,
    string? Category,
    string? Subcategory,
    bool IsPreviewable);

/// <summary>
/// A derived preview the store serves anonymously - a thumbnail or a turntable. Never an
/// original asset file.
///
/// <paramref name="PackItemId"/> is what makes a pack's previews usable: the deployed store
/// carries one cover preview with a null id and then a thumbnail and a turntable per item,
/// so without it a twenty-item pack has forty pictures and no way to say which chair is
/// which.
/// </summary>
public sealed record StoreCatalogPreview(
    string PreviewId,
    string? Kind,
    string Url,
    string? PackItemId = null);
