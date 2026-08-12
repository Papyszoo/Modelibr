using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Extraction;

/// <summary>
/// Invalidation as a set difference: which already-extracted assets of a type were
/// produced by an extractor older than <paramref name="CurrentExtractorVersion"/>
/// and therefore need re-extraction. (Assets that have never been extracted are the
/// enqueue side, owned by the extractor prompts - this query answers "stale", not
/// "missing".)
/// </summary>
public record GetStaleExtractionsQuery(string AssetType, int CurrentExtractorVersion)
    : IQuery<IReadOnlyList<StaleExtractionItem>>;

public record StaleExtractionItem(int AssetId, int? VersionId, string FileSha256, int ExtractorVersion);

internal sealed class GetStaleExtractionsQueryHandler
    : IQueryHandler<GetStaleExtractionsQuery, IReadOnlyList<StaleExtractionItem>>
{
    private readonly IAssetExtractionRepository _assetExtractionRepository;

    public GetStaleExtractionsQueryHandler(IAssetExtractionRepository assetExtractionRepository)
    {
        _assetExtractionRepository = assetExtractionRepository;
    }

    public async Task<Result<IReadOnlyList<StaleExtractionItem>>> Handle(
        GetStaleExtractionsQuery query,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query.AssetType))
        {
            return Result.Failure<IReadOnlyList<StaleExtractionItem>>(
                new Error("InvalidAssetType", "Asset type is required."));
        }

        var stale = await _assetExtractionRepository.GetStaleAsync(
            query.AssetType.Trim(), query.CurrentExtractorVersion, cancellationToken);

        IReadOnlyList<StaleExtractionItem> items = stale
            .Select(e => new StaleExtractionItem(e.AssetId, e.VersionId, e.FileSha256, e.ExtractorVersion))
            .ToList();

        return Result.Success(items);
    }
}
