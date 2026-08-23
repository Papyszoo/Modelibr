using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Media;
using SharedKernel;

namespace Application.Search;

/// <summary>
/// The assets that ARE each other: groups of models sharing a geometry fingerprint.
///
/// <para>
/// A real library import produces these by the hundred. The <c>import_library</c> playbook
/// says to collapse an FBX/OBJ pair into one asset and nothing enforced it, so the pair
/// landed as two models - and because the two exporters name their parts differently
/// (<c>/SM_Bld_Apartment_01</c> against an anonymous <c>/[0]</c>), nothing keyed on names
/// could have matched them. The geometry hash can: it is computed to agree across runtimes,
/// and both files report the same triangles.
/// </para>
///
/// <para>
/// This lists; it does not act. Search already collapses duplicates within a page of
/// results, so what is left is a library-hygiene decision - which copy is the real one -
/// and that is the user's. <c>CollapseDuplicateAssetsCommand</c> is the action.
/// </para>
/// </summary>
public record DuplicateAssetsQuery(int Page = 1, int PageSize = 25)
    : IQuery<DuplicateAssetsResponse>;

/// <param name="TotalGroups">How many duplicate groups the library holds in total.</param>
/// <param name="TotalRedundant">How many assets would go away if every group were collapsed to one.</param>
public record DuplicateAssetsResponse(
    int TotalGroups,
    int TotalRedundant,
    int Page,
    int PageSize,
    IReadOnlyList<DuplicateAssetGroup> Groups);

/// <param name="GeometryKey">The shared fingerprint - the reason these are one group.</param>
/// <param name="SuggestedSurvivorId">
/// Which copy to keep if the caller has no opinion: the one imported first, since anything
/// referencing this geometry is most likely pointing at it.
/// </param>
public record DuplicateAssetGroup(
    string GeometryKey,
    int SuggestedSurvivorId,
    IReadOnlyList<DuplicateAssetMember> Members);

public record DuplicateAssetMember(
    int ModelId,
    string Name,
    int? TriangleCount,
    string? ThumbnailUrl,
    string ThumbnailStatus);

internal sealed class DuplicateAssetsQueryHandler
    : IQueryHandler<DuplicateAssetsQuery, DuplicateAssetsResponse>
{
    private const int MaxPageSize = 100;

    private readonly IAssetSearchDocumentRepository _searchDocuments;
    private readonly IModelRepository _models;
    private readonly IAssetThumbnails _thumbnails;

    public DuplicateAssetsQueryHandler(
        IAssetSearchDocumentRepository searchDocuments,
        IModelRepository models,
        IAssetThumbnails thumbnails)
    {
        _searchDocuments = searchDocuments;
        _models = models;
        _thumbnails = thumbnails;
    }

    public async Task<Result<DuplicateAssetsResponse>> Handle(
        DuplicateAssetsQuery query,
        CancellationToken cancellationToken)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var found = await _searchDocuments.GetDuplicateGeometryGroupsAsync(
            ExtractionAssetTypes.Model, page, pageSize, cancellationToken);

        if (found.Groups.Count == 0)
        {
            return Result.Success(new DuplicateAssetsResponse(
                found.TotalGroups, found.TotalRedundant, page, pageSize,
                Array.Empty<DuplicateAssetGroup>()));
        }

        var modelIds = found.Groups.SelectMany(g => g.Members.Select(m => m.AssetId)).Distinct().ToList();
        var identities = (await _models.GetIdentitiesAsync(modelIds, cancellationToken))
            .ToDictionary(m => m.Id);

        var pictures = await _thumbnails.ResolveAsync(
            identities.Values.Select(m =>
                new AssetThumbnailRef(ExtractionAssetTypes.Model, m.Id, m.ActiveVersionId)),
            cancellationToken);

        var groups = new List<DuplicateAssetGroup>(found.Groups.Count);
        foreach (var group in found.Groups)
        {
            var members = new List<DuplicateAssetMember>(group.Members.Count);
            foreach (var member in group.Members.OrderBy(m => m.AssetId))
            {
                if (!identities.TryGetValue(member.AssetId, out var identity)) continue;

                var key = new AssetThumbnailRef(
                    ExtractionAssetTypes.Model, identity.Id, identity.ActiveVersionId).Key;
                var picture = pictures.TryGetValue(key, out var found2)
                    ? found2
                    : new AssetThumbnail(null, AssetThumbnailStatuses.Unknown);

                members.Add(new DuplicateAssetMember(
                    identity.Id, identity.Name, member.TriangleCount, picture.Url, picture.Status));
            }

            // A group that lost members to a concurrent delete is no longer a duplicate.
            if (members.Count < 2) continue;

            groups.Add(new DuplicateAssetGroup(
                group.GeometryKey, members[0].ModelId, members));
        }

        return Result.Success(new DuplicateAssetsResponse(
            found.TotalGroups, found.TotalRedundant, page, pageSize, groups));
    }
}
