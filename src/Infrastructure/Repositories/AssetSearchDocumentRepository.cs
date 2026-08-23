using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class AssetSearchDocumentRepository : IAssetSearchDocumentRepository
{
    private readonly ApplicationDbContext _context;

    public AssetSearchDocumentRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(AssetSearchDocument document, CancellationToken cancellationToken = default)
    {
        _context.AssetSearchDocuments.Add(document);
        return Task.CompletedTask;
    }

    public async Task<IReadOnlyDictionary<string, int>> CountIndexedAssetsByTypeAsync(
        CancellationToken cancellationToken = default)
    {
        // Asset-level rows only (null PartPath) and current-version only, which is exactly
        // what search answers from - so this counts what is findable, not what is stored.
        var counts = await _context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.PartPath == null && d.IsCurrentVersion)
            .GroupBy(d => d.AssetType)
            .Select(g => new { AssetType = g.Key, Count = g.Select(d => d.AssetId).Distinct().Count() })
            .ToListAsync(cancellationToken);

        return counts.ToDictionary(c => c.AssetType, c => c.Count, StringComparer.Ordinal);
    }

    public async Task RemoveForAssetAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default)
    {
        var existing = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId && d.VersionId == versionId)
            .ToListAsync(cancellationToken);
        _context.AssetSearchDocuments.RemoveRange(existing);
    }

    public async Task RemoveAllForAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default)
    {
        var existing = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId)
            .ToListAsync(cancellationToken);
        _context.AssetSearchDocuments.RemoveRange(existing);
    }

    public async Task SetCurrentVersionAsync(
        string assetType,
        int assetId,
        int? currentVersionId,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetCurrentVersion(document.VersionId == currentVersionId);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetActiveForAssetAsync(
        string assetType,
        int assetId,
        bool isActive,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId && d.IsActive != isActive)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetActive(isActive);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetActiveForVersionAsync(
        string assetType,
        int assetId,
        int versionId,
        bool isActive,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType &&
                        d.AssetId == assetId &&
                        d.VersionId == versionId &&
                        d.IsActive != isActive)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetActive(isActive);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetCategoryForAssetAsync(
        string assetType,
        int assetId,
        int? categoryId,
        string? categoryName,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetCategory(categoryId, categoryName);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetMetadataForAssetAsync(
        string assetType,
        int assetId,
        IEnumerable<string> tags,
        string? description,
        CancellationToken cancellationToken = default)
    {
        var names = tags as IReadOnlyList<string> ?? tags.ToList();

        // Asset-level documents only. A part is a mesh inside the asset; the tags describe
        // the asset, and copying them onto every part would multiply one signal by the part
        // count and let a many-part model dominate any tag query.
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId && d.PartPath == null)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetMetadata(names, description);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetPacksForAssetAsync(
        string assetType,
        int assetId,
        IEnumerable<string> packNames,
        CancellationToken cancellationToken = default)
    {
        var names = packNames as IReadOnlyList<string> ?? packNames.ToList();

        // Asset-level documents only - pack names are not projected onto parts, so
        // patching them there would write a column that search never reads for a part.
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId && d.PartPath == null)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetPacks(names);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetPacksForAssetsAsync(
        string assetType,
        IReadOnlyDictionary<int, IReadOnlyList<string>> packNamesByAssetId,
        CancellationToken cancellationToken = default)
    {
        if (packNamesByAssetId.Count == 0)
        {
            return;
        }

        var assetIds = packNamesByAssetId.Keys.ToList();

        // Asset-level documents only, exactly as the single-asset path does.
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && assetIds.Contains(d.AssetId) && d.PartPath == null)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            // A caller that lists an asset with no remaining packs passes an empty list;
            // an asset missing from the map entirely is not ours to touch.
            if (!packNamesByAssetId.TryGetValue(document.AssetId, out var names))
            {
                continue;
            }

            document.SetPacks(names);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetSchemaFacetsForAssetAsync(
        string assetType,
        int assetId,
        IEnumerable<string>? styles,
        IEnumerable<string>? themes,
        string? license,
        CancellationToken cancellationToken = default)
    {
        // Asset-level documents only: a facet describes the asset, not one of its meshes.
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId && d.PartPath == null)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetSchemaFacets(styles, themes, license);
        }
    }

    public async Task<DuplicateGeometryPage> GetDuplicateGeometryGroupsAsync(
        string assetType,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        // Asset-level, current-version, live documents that actually carry a fingerprint.
        // An unhashed asset must never group with every other unhashed asset - "we both
        // have no fingerprint" is not a thing in common.
        var eligible = _context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.AssetType == assetType &&
                        d.PartPath == null &&
                        d.IsCurrentVersion &&
                        d.IsActive &&
                        d.GeometryKey != null);

        var grouped = eligible
            .GroupBy(d => d.GeometryKey!)
            .Select(g => new { GeometryKey = g.Key, Count = g.Count() })
            .Where(g => g.Count > 1);

        var totals = await grouped
            .GroupBy(_ => 1)
            .Select(g => new { Groups = g.Count(), Assets = g.Sum(x => x.Count) })
            .FirstOrDefaultAsync(cancellationToken);

        if (totals is null)
        {
            return new DuplicateGeometryPage(0, 0, Array.Empty<DuplicateGeometryGroup>());
        }

        // Biggest groups first - a prop imported six times is more worth a decision than a
        // pair - then by key so the ordering is total and paging cannot repeat a group.
        var keys = await grouped
            .OrderByDescending(g => g.Count)
            .ThenBy(g => g.GeometryKey)
            .Skip(Math.Max(0, page - 1) * pageSize)
            .Take(pageSize)
            .Select(g => g.GeometryKey)
            .ToListAsync(cancellationToken);

        if (keys.Count == 0)
        {
            return new DuplicateGeometryPage(
                totals.Groups, totals.Assets - totals.Groups, Array.Empty<DuplicateGeometryGroup>());
        }

        var members = await eligible
            .Where(d => keys.Contains(d.GeometryKey!))
            .Select(d => new { Key = d.GeometryKey!, d.AssetId, d.TriangleCount })
            .ToListAsync(cancellationToken);

        var groups = keys
            .Select(key => new DuplicateGeometryGroup(
                key,
                members
                    .Where(m => m.Key == key)
                    .Select(m => new DuplicateGeometryMember(m.AssetId, m.TriangleCount))
                    .ToList()))
            .Where(g => g.Members.Count > 1)
            .ToList();

        // One asset per group is the original; the rest are the copies.
        return new DuplicateGeometryPage(
            totals.Groups, totals.Assets - totals.Groups, groups);
    }

    public Task<AssetSearchDocument?> GetCurrentAssetDocumentAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default)
    {
        return _context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.AssetType == assetType &&
                        d.AssetId == assetId &&
                        d.PartPath == null &&
                        d.IsCurrentVersion)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AssetSearchDocument>> GetForOtherVersionsAsync(
        string assetType,
        int assetId,
        int? currentVersionId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType &&
                        d.AssetId == assetId &&
                        d.VersionId != currentVersionId &&
                        d.IsCurrentVersion)
            .ToListAsync(cancellationToken);
    }

    public Task UpdateAsync(AssetSearchDocument document, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(document);
        return Task.CompletedTask;
    }
}
