using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction.Derivation;
using SharedKernel;

namespace Application.Search;

/// <summary>
/// How much of the library is findable.
///
/// An agent that starts seven hundred imports cannot see them finish, and the only way to
/// tell "still working" from "quietly failed" was to search for something and guess. This
/// turns waiting into a loop with an exit condition.
/// </summary>
public sealed record GetIndexStatusQuery : IQuery<IndexStatusResponse>;

/// <param name="Derived">Assets with a derived row - extraction produced something usable.</param>
/// <param name="Indexed">
/// Assets with a current-version search document. This is what <c>search_assets</c> can
/// actually find, and it is the number that matters: an asset can be derived and unindexed.
/// </param>
/// <param name="Stale">
/// Derived rows written under an older derive version. They still answer, from an older
/// projection - <c>trigger_rederive</c> is what moves them forward.
/// </param>
public sealed record IndexStatusFamily(string AssetType, int Derived, int Indexed, int Stale);

/// <param name="DeriveVersion">The derive version this build writes. A row below it is stale.</param>
/// <param name="Notes">
/// What the numbers do <b>not</b> say. Reported because the failure this exists to catch is a
/// caller reading "1,784 indexed" as "the library is ready" when a third of them were derived
/// under an older projection.
/// </param>
public sealed record IndexStatusResponse(
    int DeriveVersion,
    IReadOnlyList<IndexStatusFamily> Families,
    int TotalDerived,
    int TotalIndexed,
    int TotalStale,
    IReadOnlyList<string> Notes);

internal sealed class GetIndexStatusQueryHandler
    : IQueryHandler<GetIndexStatusQuery, IndexStatusResponse>
{
    private readonly IAssetDerivationRepository _derivations;
    private readonly IAssetSearchDocumentRepository _documents;
    private readonly DerivationOptions _options;

    public GetIndexStatusQueryHandler(
        IAssetDerivationRepository derivations,
        IAssetSearchDocumentRepository documents,
        DerivationOptions options)
    {
        _derivations = derivations;
        _documents = documents;
        _options = options;
    }

    public async Task<Result<IndexStatusResponse>> Handle(
        GetIndexStatusQuery query,
        CancellationToken cancellationToken)
    {
        var derived = await _derivations.CountDerivedByTypeAsync(_options.DeriveVersion, cancellationToken);
        var indexed = await _documents.CountIndexedAssetsByTypeAsync(cancellationToken);

        // Union, not a join off the derived side: a family with search documents and no
        // derived rows is a real and interesting state - it is what a projection left behind
        // by a wiped derivation layer looks like - and a join would hide it.
        var families = derived
            .Select(d => d.AssetType)
            .Union(indexed.Keys, StringComparer.Ordinal)
            .OrderBy(t => t, StringComparer.Ordinal)
            .Select(assetType =>
            {
                var counts = derived.FirstOrDefault(d => string.Equals(d.AssetType, assetType, StringComparison.Ordinal));
                return new IndexStatusFamily(
                    assetType,
                    counts.AssetType is null ? 0 : counts.Derived,
                    indexed.GetValueOrDefault(assetType),
                    counts.AssetType is null ? 0 : counts.Stale);
            })
            .ToList();

        var notes = new List<string>();

        var behind = families.Where(f => f.Derived > f.Indexed).ToList();
        if (behind.Count > 0)
        {
            notes.Add(
                "Derived but not indexed: " +
                string.Join(", ", behind.Select(f => $"{f.AssetType} {f.Derived - f.Indexed}")) +
                ". These assets exist and cannot be found by search. reindex_search rebuilds their documents from the stored derivations.");
        }

        var stale = families.Where(f => f.Stale > 0).ToList();
        if (stale.Count > 0)
        {
            notes.Add(
                "Derived under an older projection: " +
                string.Join(", ", stale.Select(f => $"{f.AssetType} {f.Stale}")) +
                $". They still answer, from derive version below {_options.DeriveVersion}. trigger_rederive moves one forward.");
        }

        if (notes.Count == 0)
        {
            notes.Add("Everything derived is indexed, at the current derive version.");
        }

        return Result.Success(new IndexStatusResponse(
            _options.DeriveVersion,
            families,
            families.Sum(f => f.Derived),
            families.Sum(f => f.Indexed),
            families.Sum(f => f.Stale),
            notes));
    }
}
