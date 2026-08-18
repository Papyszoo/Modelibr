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
