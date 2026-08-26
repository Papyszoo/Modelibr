using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Media;
using SharedKernel;

namespace Application.Metadata;

/// <summary>
/// The review queue: assets the import automation classified that nobody has confirmed or
/// corrected yet.
///
/// <para>
/// This is the other half of automating classification. Applying a guess silently would be
/// the worst of both worlds - the library gains categories nobody chose and nothing says
/// which ones were guessed. Everything the automation did is listed here, with what it
/// decided and what it decided it from, until a person says otherwise.
/// </para>
/// </summary>
public record ImportSuggestionsQuery(int Page = 1, int PageSize = 50)
    : IQuery<ImportSuggestionsResponse>;

/// <param name="Total">How many assets are waiting in total - the banner's number.</param>
public record ImportSuggestionsResponse(
    int Total,
    int Page,
    int PageSize,
    IReadOnlyList<ImportSuggestionItem> Items);

/// <param name="SourceFolder">Where the asset was imported from - the evidence behind the tags.</param>
public record ImportSuggestionItem(
    int ModelId,
    string Name,
    string? ThumbnailUrl,
    string ThumbnailStatus,
    int? CategoryId,
    string? CategoryName,
    IReadOnlyList<string> Tags,
    string? SourceFolder,
    DateTime AppliedAt);

internal sealed class ImportSuggestionsQueryHandler
    : IQueryHandler<ImportSuggestionsQuery, ImportSuggestionsResponse>
{
    private const int MaxPageSize = 200;

    private readonly IAssetMetadataRepository _metadata;
    private readonly IModelRepository _models;
    private readonly IModelCategoryRepository _categories;
    private readonly IAssetThumbnails _thumbnails;

    public ImportSuggestionsQueryHandler(
        IAssetMetadataRepository metadata,
        IModelRepository models,
        IModelCategoryRepository categories,
        IAssetThumbnails thumbnails)
    {
        _metadata = metadata;
        _models = models;
        _categories = categories;
        _thumbnails = thumbnails;
    }

    public async Task<Result<ImportSuggestionsResponse>> Handle(
        ImportSuggestionsQuery query,
        CancellationToken cancellationToken)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var (rows, total) = await _metadata.GetPendingAutoReviewAsync(
            ExtractionAssetTypes.Model, page, pageSize, cancellationToken);

        if (rows.Count == 0)
        {
            return Result.Success(new ImportSuggestionsResponse(
                total, page, pageSize, Array.Empty<ImportSuggestionItem>()));
        }

        var modelIds = rows.Select(r => r.AssetId).ToList();
        var models = (await _models.GetIdentitiesAsync(modelIds, cancellationToken))
            .ToDictionary(m => m.Id);

        // One lookup for the whole page rather than one per row - the category set is tiny
        // and the same handful of ids repeat down the list.
        var categories = (await _categories.GetAllAsync(cancellationToken))
            .ToDictionary(c => c.Id, c => c.Name);

        var pictures = await _thumbnails.ResolveAsync(
            rows
                .Where(r => models.ContainsKey(r.AssetId))
                .Select(r => new AssetThumbnailRef(
                    ExtractionAssetTypes.Model, r.AssetId, models[r.AssetId].ActiveVersionId)),
            cancellationToken);

        var items = new List<ImportSuggestionItem>(rows.Count);
        foreach (var row in rows)
        {
            // A row whose model is gone (recycled, permanently deleted) has nothing left to
            // review. Skipped rather than shown as an unnamed entry.
            if (!models.TryGetValue(row.AssetId, out var model)) continue;

            var key = new AssetThumbnailRef(
                ExtractionAssetTypes.Model, row.AssetId, model.ActiveVersionId).Key;
            var picture = pictures.TryGetValue(key, out var found)
                ? found
                : new AssetThumbnail(null, AssetThumbnailStatuses.Unknown);

            items.Add(new ImportSuggestionItem(
                model.Id,
                model.Name,
                picture.Url,
                picture.Status,
                row.AutoCategoryId,
                row.AutoCategoryId is { } id && categories.TryGetValue(id, out var name) ? name : null,
                row.AutoTags.ToList(),
                row.SourceFolder,
                row.AutoAppliedAt!.Value));
        }

        return Result.Success(new ImportSuggestionsResponse(total, page, pageSize, items));
    }
}
